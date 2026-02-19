import type { Target } from "@stainless-api/sdk/resources/shared";
import { commentThrottler, printInternalComment } from "./comment";
import { getInput, getPRNumber, getStainlessAuth, setOutput } from "./compat";
import { logger } from "./logger";
import {
  type Outcomes,
  FailRunOn,
  getDiffLanguages,
  shouldFailRun,
} from "./outcomes";
import { combineAsyncIterators, pollBuild } from "./runBuilds";
import { createAutoRefreshFetch, getStainlessClient } from "./stainless";

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

    const auth = await getStainlessAuth();
    const stainless = getStainlessClient("internal-preview", {
      apiKey: auth.key,
      logLevel: "warn",
      fetch: createAutoRefreshFetch(auth, getStainlessAuth),
    });

    const projectStates = targetGroups.map((group) => ({
      group,
      outcomes: null as Outcomes | null,
      baseOutcomes: null as Outcomes | null,
    }));

    // kick off compare builds for all projects in parallel
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
      const projectName = targetGroups[i].project;
      pollIterators.push({
        iterator: pollBuild({
          stainless,
          build: base,
          projectName,
          label: "base",
        }),
        projectIndex: i,
        isBase: true,
      });
      pollIterators.push({
        iterator: pollBuild({
          stainless,
          build: head,
          projectName,
          label: "head",
        }),
        projectIndex: i,
        isBase: false,
      });
    }

    const indexedIterators = pollIterators.map((p) => p.iterator);

    const upsert = gitHostToken
      ? commentThrottler(gitHostToken, prNumber)
      : null;

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

      const body = printInternalComment(commentProjects);
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

      if (state.outcomes && state.baseOutcomes) {
        for (const [lang, head] of Object.entries(state.outcomes)) {
          const base = state.baseOutcomes[lang];
          const baseTreeOid = base?.commit?.completed?.commit?.tree_oid;
          const headTreeOid = head.commit?.completed?.commit?.tree_oid;
          if (baseTreeOid && headTreeOid && baseTreeOid !== headTreeOid) {
            head.hasDiff = true;
          } else {
            head.hasDiff = false;
          }
        }
      }

      if (state.outcomes) {
        await updateComment(false);
      }
    }

    updateComment(true);

    const allOutcomes: Record<string, Outcomes> = {};
    for (const state of projectStates) {
      const key = `${state.group.org}/${state.group.project}`;
      if (state.outcomes) {
        allOutcomes[key] = state.outcomes;
      }
    }
    setOutput("outcomes", allOutcomes);
    setOutput(
      "diff_targets",
      Object.entries(allOutcomes).flatMap(([project, outcomes]) =>
        getDiffLanguages(outcomes).map((language) => ({ project, language })),
      ),
    );

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
