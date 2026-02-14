import type { Target } from "@stainless-api/sdk/resources/shared";
import { commentThrottler, printInternalComment } from "./comment";
import { getInput, getPRNumber, getStainlessAuth, setOutput } from "./compat";
import { logger } from "./logger";
import { type Outcomes, FailRunOn, shouldFailRun } from "./outcomes";
import { combineAsyncIterators, pollBuild } from "./runBuilds";
import { createAutoRefreshFetch, getStainlessClient } from "./stainless";

type RepoDiffEntry = {
  owner: string;
  name: string;
  baseBranch: string;
  headBranch: string;
  key: string;
};

async function fetchRepoDiffs(
  token: string,
  entries: RepoDiffEntry[],
): Promise<Set<string>> {
  if (entries.length === 0) return new Set();

  const fragments = entries.map(
    (entry, i) =>
      `repo${i}: repository(owner: ${JSON.stringify(entry.owner)}, name: ${JSON.stringify(entry.name)}) {
      base: ref(qualifiedName: ${JSON.stringify(`refs/heads/${entry.baseBranch}`)}) {
        target { oid }
      }
      head: ref(qualifiedName: ${JSON.stringify(`refs/heads/${entry.headBranch}`)}) {
        target { oid }
      }
    }`,
  );
  const query = `{ ${fragments.join("\n")} }`;

  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      logger.warn(`GraphQL diff check failed: ${response.status}`);
      return new Set();
    }

    const result = (await response.json()) as {
      data?: Record<
        string,
        {
          base?: { target?: { oid?: string } };
          head?: { target?: { oid?: string } };
        }
      >;
    };
    const hasDiff = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      const data = result.data?.[`repo${i}`];
      const baseOid = data?.base?.target?.oid;
      const headOid = data?.head?.target?.oid;

      if (baseOid && headOid && baseOid !== headOid) {
        hasDiff.add(entries[i].key);
      }
    }

    return hasDiff;
  } catch (error) {
    logger.warn("Failed to fetch repo diffs:", error);
    return new Set();
  }
}

type TargetGroup = {
  org: string;
  project: string;
  languages: string[];
};

function parseTargets(
  input: string,
  knownLanguages: Set<string>,
): TargetGroup[] {
  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const grouped = new Map<string, { org: string; languages: string[] }>();

  for (const line of lines) {
    const slashIdx = line.indexOf("/");
    if (slashIdx === -1) {
      throw new Error(
        `Invalid target: "${line}". Expected format: {org}/{project} or {org}/{project}-{language}`,
      );
    }

    const org = line.slice(0, slashIdx);
    const rest = line.slice(slashIdx + 1);

    // Try to split off a known language suffix (e.g. "openai-typescript" → project="openai", lang="typescript")
    const lastHyphen = rest.lastIndexOf("-");
    let project: string;
    let language: string | null = null;
    if (lastHyphen !== -1) {
      const suffix = rest.slice(lastHyphen + 1);
      if (knownLanguages.has(suffix)) {
        project = rest.slice(0, lastHyphen);
        language = suffix;
      } else {
        project = rest;
      }
    } else {
      project = rest;
    }

    const key = `${org}/${project}`;
    const existing = grouped.get(key);
    if (existing) {
      if (language) existing.languages.push(language);
    } else {
      grouped.set(key, { org, languages: language ? [language] : [] });
    }
  }

  return Array.from(grouped.entries()).map(([key, { org, languages }]) => ({
    org,
    project: key.split("/")[1],
    languages,
  }));
}

async function main() {
  try {
    const targetsInput = getInput("targets", { required: true });
    const languagesInput = getInput("languages", { required: true });
    const failRunOn = getInput("fail_on", {
      choices: FailRunOn,
      required: true,
    });
    const baseSha = getInput("base_sha", { required: true });
    const headSha = getInput("head_sha", { required: true });
    const baseBranch = getInput("base_branch", { required: true });
    const branch = getInput("branch", { required: true });
    const gitHostToken = getInput("github_token");
    const prNumber = getPRNumber();

    const knownLanguages = new Set<string>(JSON.parse(languagesInput));
    const targetGroups = parseTargets(targetsInput, knownLanguages);
    if (targetGroups.length === 0) {
      throw new Error("No valid project tuples found in 'targets' input");
    }

    logger.info(
      `Parsed ${targetGroups.length} project group(s): ${targetGroups.map((g) => `${g.org}/${g.project}${g.languages.length > 0 ? ` [${g.languages.join(", ")}]` : " [all targets]"}`).join("; ")}`,
    );

    // Auth via OIDC (no API key input for this action)
    const auth = await getStainlessAuth();
    const stainless = getStainlessClient("internal-preview", {
      apiKey: auth.key,
      logLevel: "warn",
      fetch: createAutoRefreshFetch(auth, getStainlessAuth),
    });

    // Per-project state
    const projectStates = targetGroups.map((group) => ({
      group,
      outcomes: null as Outcomes | null,
      baseOutcomes: null as Outcomes | null,
    }));

    // Kick off compare builds for all projects in parallel
    const pollIterators: {
      iterator: AsyncGenerator<{
        outcomes: Outcomes;
        documentedSpec: string | null;
      }>;
      projectIndex: number;
      isBase: boolean;
    }[] = [];

    const compareResults = await Promise.all(
      targetGroups.map((group) =>
        stainless.builds.compare(
          {
            project: group.project,
            ...(group.languages.length > 0 && {
              targets: group.languages as Target[],
            }),
            base: {
              branch: baseBranch,
              revision: "main",
              codegen_version: baseSha,
            } as Parameters<typeof stainless.builds.compare>[0]["base"],
            head: {
              branch,
              revision: "main",
              codegen_version: headSha,
            } as Parameters<typeof stainless.builds.compare>[0]["head"],
          },
          { timeout: 3 * 60 * 1000 },
        ),
      ),
    );

    for (let i = 0; i < compareResults.length; i++) {
      const { base, head } = compareResults[i];
      pollIterators.push({
        iterator: pollBuild({ stainless, build: base, label: "base" }),
        projectIndex: i,
        isBase: true,
      });
      pollIterators.push({
        iterator: pollBuild({ stainless, build: head, label: "head" }),
        projectIndex: i,
        isBase: false,
      });
    }

    // Create indexed async iterators for combineAsyncIterators
    const indexedIterators = pollIterators.map((p) => p.iterator);

    const upsert = gitHostToken
      ? commentThrottler(gitHostToken, prNumber)
      : null;

    let sdkDiffs = new Set<string>();

    const updateComment = async (force: boolean) => {
      if (!upsert) return;

      const commentProjects = projectStates
        .filter((s) => s.outcomes)
        .map((s) => ({
          orgName: s.group.org,
          projectName: s.group.project,
          branch,
          outcomes: s.outcomes!,
          baseOutcomes: s.baseOutcomes,
        }));

      if (commentProjects.length === 0) return;

      const body = printInternalComment(commentProjects, sdkDiffs);
      await upsert({ body, force });
    };

    for await (const { index, value } of combineAsyncIterators(
      ...indexedIterators,
    )) {
      const { projectIndex, isBase } = pollIterators[index];
      const state = projectStates[projectIndex];

      if (isBase) {
        state.baseOutcomes = value.outcomes;
      } else {
        state.outcomes = value.outcomes;
      }

      if (state.outcomes) {
        await updateComment(false);
      }
    }

    // Fetch diffs for all completed repos in a single GraphQL query
    if (gitHostToken) {
      const diffEntries: RepoDiffEntry[] = [];
      for (const state of projectStates) {
        if (!state.outcomes || !state.baseOutcomes) continue;
        for (const [lang, head] of Object.entries(state.outcomes)) {
          const base = state.baseOutcomes[lang];
          if (
            !head.commit?.completed?.commit ||
            !base?.commit?.completed?.commit
          )
            continue;
          diffEntries.push({
            owner: head.commit.completed.commit.repo.owner,
            name: head.commit.completed.commit.repo.name,
            baseBranch: base.commit.completed.commit.repo.branch,
            headBranch: head.commit.completed.commit.repo.branch,
            key: `${state.group.org}/${state.group.project}-${lang}`,
          });
        }
      }
      sdkDiffs = await fetchRepoDiffs(gitHostToken, diffEntries);
    }

    // Final forced comment update (now includes diff indicators)
    await updateComment(true);

    // Set outputs
    const allOutcomes: Record<string, Outcomes> = {};
    for (const state of projectStates) {
      const key = `${state.group.org}/${state.group.project}`;
      if (state.outcomes) {
        allOutcomes[key] = state.outcomes;
      }
    }
    setOutput("outcomes", allOutcomes);

    // Check if any project should fail the run
    let shouldFail = false;
    for (const state of projectStates) {
      if (
        state.outcomes &&
        !shouldFailRun({
          failRunOn,
          outcomes: state.outcomes,
          baseOutcomes: state.baseOutcomes,
        })
      ) {
        shouldFail = true;
      }
    }

    if (shouldFail) {
      process.exit(1);
    }
  } catch (error) {
    logger.fatal("Error in internal-preview action:", error);
    process.exit(1);
  }
}

main();
