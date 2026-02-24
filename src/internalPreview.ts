import type { Target } from "@stainless-api/sdk/resources/shared";
import { execFileSync } from "child_process";
import { commentThrottler, printInternalComment } from "./comment";
import { getInput, getStainlessAuth, setOutput } from "./compat";
import { mkdtempSync, rmSync } from "fs";
import { logger } from "./logger";
import { tmpdir } from "os";
import { join } from "path";
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

type DiffStats = { additions: number; deletions: number; changedFiles: number };

// Fetches diff stats by doing a minimal bare clone of the repo, running
// `git diff --numstat base..head`, then deleting the clone immediately.
function fetchDiffStats({
  owner,
  repo,
  base,
  head,
  token,
}: {
  owner: string;
  repo: string;
  base: string;
  head: string;
  token: string;
}): DiffStats | null {
  const repoUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  const tmpDir = mkdtempSync(join(tmpdir(), "stl-diff-"));

  try {
    execFileSync("git", ["init", "--bare", tmpDir], { stdio: "pipe" });
    execFileSync("git", ["-C", tmpDir, "remote", "add", "origin", repoUrl], {
      stdio: "pipe",
    });
    // Fetch only the two branches we need at depth 1 to minimise data transfer.
    execFileSync(
      "git",
      [
        "-C",
        tmpDir,
        "fetch",
        "--depth=1",
        "--no-tags",
        "origin",
        `refs/heads/${base}:refs/heads/${base}`,
        `refs/heads/${head}:refs/heads/${head}`,
      ],
      { stdio: "pipe" },
    );

    const output = execFileSync(
      "git",
      ["-C", tmpDir, "diff", "--numstat", `${base}..${head}`],
      { encoding: "utf8" },
    );

    const lines = output.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    let additions = 0;
    let deletions = 0;
    for (const line of lines) {
      const [add, del] = line.split("\t");
      // Binary files are reported as "-"; skip them for line counts.
      if (add !== "-") additions += parseInt(add, 10);
      if (del !== "-") deletions += parseInt(del, 10);
    }

    return { additions, deletions, changedFiles: lines.length };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
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

    const githubToken = getInput("github_token");

    const projectStates = targetGroups.map((group) => ({
      group,
      outcomes: null as Outcomes | null,
      baseOutcomes: null as Outcomes | null,
      // Keyed by lang. Populated once on first encounter of merge_conflict so
      // the REST compare is called at most once per lang per run.
      codegenDiffCache: {} as Record<
        string,
        {
          hasDiff: boolean;
          compareUrl: string;
          diffStats: DiffStats | null;
        } | null
      >,
      // Keyed by lang. Populated once when hasDiff is first detected for
      // normal (non-merge-conflict) diffs.
      normalDiffStatsCache: {} as Record<string, DiffStats | null>,
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

    const upsert = commentThrottler();
    let allBuildsComplete = false;

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

      const body = printInternalComment(commentProjects, {
        isComplete: allBuildsComplete,
      });
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

          if (head.commit?.conclusion === "merge_conflict") {
            // Don't determine diff until base has also concluded so its
            // codegen branch is in its final state before we compare.
            if (!base?.commit?.conclusion) continue;

            // On first encounter, clone the codegen repo and diff the two
            // branches to determine hasDiff and stats. Cache the result so
            // the clone is done at most once per lang per run.
            if (!(lang in state.codegenDiffCache)) {
              const conflictRepo = head.commit.merge_conflict_pr?.repo;

              const owner = "stainless-sdks";
              const repo = `${state.group.project}-${lang}`;

              if (conflictRepo && githubToken) {
                const compareUrl = `https://github.com/${owner}/${repo}/compare/codegen/${baseBranch}..codegen/${branch}`;
                logger.info(
                  `Fetching codegen diff stats: ${owner}/${repo} (${lang})`,
                );
                const diffStats = fetchDiffStats({
                  owner,
                  repo,
                  base: `codegen/${baseBranch}`,
                  head: `codegen/${branch}`,
                  token: githubToken,
                });
                state.codegenDiffCache[lang] = {
                  hasDiff: diffStats !== null,
                  compareUrl,
                  diffStats,
                };
              } else {
                state.codegenDiffCache[lang] = null;
              }
            }

            const cached = state.codegenDiffCache[lang];
            if (cached) {
              head.hasDiff = cached.hasDiff;
              head.codegenCompareUrl = cached.compareUrl;
              head.diffStats = cached.diffStats ?? undefined;
            }
          } else {
            const baseTreeOid = base?.commit?.completed?.commit?.tree_oid;
            const headTreeOid = head.commit?.completed?.commit?.tree_oid;
            if (baseTreeOid && headTreeOid) {
              head.hasDiff = baseTreeOid !== headTreeOid;

              // On first detection of a diff, clone and diff the repo to get stats.
              if (
                head.hasDiff &&
                !(lang in state.normalDiffStatsCache) &&
                githubToken
              ) {
                const headCommit = head.commit?.completed?.commit;
                const baseCommit = base.commit?.completed?.commit;
                if (baseCommit && headCommit) {
                  logger.info(
                    `Fetching diff stats: ${headCommit.repo.owner}/${headCommit.repo.name} (${lang})`,
                  );
                  const diffStats = fetchDiffStats({
                    owner: headCommit.repo.owner,
                    repo: headCommit.repo.name,
                    base: baseCommit.repo.branch,
                    head: headCommit.repo.branch,
                    token: githubToken,
                  });
                  state.normalDiffStatsCache[lang] = diffStats;
                }
              }

              if (lang in state.normalDiffStatsCache) {
                head.diffStats = state.normalDiffStatsCache[lang] ?? undefined;
              }
            }
            // If either OID is absent the base hasn't generated a commit yet;
            // leave hasDiff undefined rather than assuming false.
          }
        }
      }

      if (state.outcomes) {
        await updateComment(false);
      }
    }

    allBuildsComplete = true;
    await updateComment(true);

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
          projectName: state.group.project,
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
