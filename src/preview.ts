import {
  getBooleanInput,
  getInput,
  isPullRequestOpenedEvent,
  setOutput,
  startGroup,
  endGroup,
  getGitHostToken,
  getPRNumber,
  getStainlessAuthToken,
} from "./compat";
import { Stainless } from "@stainless-api/sdk";
import * as fs from "node:fs";
import {
  commentThrottler,
  printComment,
  retrieveComment,
  upsertComment,
} from "./comment";
import {
  generateAiCommitMessage,
  makeCommitMessageConventional,
} from "./commitMessage";
import {
  getMergeBase,
  getNonMainBaseRef,
  isConfigChanged,
  readConfig,
  saveConfig,
} from "./config";
import type { Config } from "./config";
import { shouldFailRun, FailRunOn } from "./outcomes";
import { runBuilds } from "./runBuilds";
import type { RunResult } from "./runBuilds";

// TODO: Replace with statsig feature flag
export const ENABLE_AI_COMMIT_MESSAGES = true;

async function main() {
  try {
    const apiKey = await getStainlessAuthToken();
    const orgName = getInput("org", { required: true });
    const projectName = getInput("project", { required: true });
    const oasPath = getInput("oas_path", { required: false });
    const configPath = getInput("config_path", { required: false });
    const defaultCommitMessage = getInput("commit_message", { required: true });
    const guessConfig = getBooleanInput("guess_config", { required: false });
    const failRunOn = getInput("fail_on", {
      choices: FailRunOn,
      required: true,
    });
    const makeComment = getBooleanInput("make_comment", { required: true });
    const gitHostToken = getGitHostToken();
    const baseSha = getInput("base_sha", { required: true });
    const baseRef = getInput("base_ref", { required: true });
    const baseBranch = getInput("base_branch", { required: true });
    const defaultBranch = getInput("default_branch", { required: true });
    const headSha = getInput("head_sha", { required: true });
    const branch = getInput("branch", { required: true });
    const outputDir = getInput("output_dir", { required: false }) || undefined;
    const prNumber = getPRNumber();

    const enableAiCommitMessages = ENABLE_AI_COMMIT_MESSAGES;

    // If we came from the checkout-pr-ref action, we might need to save the
    // generated config files.
    const { savedSha } = await saveConfig({
      oasPath,
      configPath,
    });
    if (savedSha !== null && savedSha !== headSha) {
      console.warn(
        `Expected HEAD to be ${headSha}, but was ${savedSha}. This might cause issues with getting the head revision.`,
      );
    }

    const stainless = new Stainless({
      project: projectName,
      apiKey,
      logLevel: "warn",
    });

    startGroup("parent-revision", "Getting parent revision");

    const { mergeBaseSha } = await getMergeBase({ baseSha, headSha });
    const { nonMainBaseRef } = await getNonMainBaseRef({
      baseRef,
      defaultBranch,
    });

    const mergeBaseConfig = await readConfig({
      oasPath,
      configPath,
      sha: mergeBaseSha,
    });
    const headConfig = await readConfig({
      oasPath,
      configPath,
      sha: headSha,
      required: true,
    });

    const configChanged = await isConfigChanged({
      before: mergeBaseConfig,
      after: headConfig,
    });

    if (!configChanged) {
      console.log("No config files changed, skipping preview");

      // In this case, we only want to make a comment if there's an existing
      // comment---which can happen if the changes introduced by the PR
      // disappear for some reason.
      if (isPullRequestOpenedEvent() && makeComment) {
        startGroup("update-comment", "Updating comment");

        const commentBody = printComment({ noChanges: true });

        await upsertComment({
          body: commentBody,
          token: gitHostToken!,
          skipCreate: true,
          prNumber,
        });

        endGroup("update-comment");
      }

      return;
    }

    const branchFrom = await computeBranchFrom({
      stainless,
      projectName,
      mergeBaseConfig,
      nonMainBaseRef,
      oasPath,
      configPath,
    });

    endGroup("parent-revision");

    let commitMessage = defaultCommitMessage;
    const commitMessages: Record<string, string> = {};

    // If we're making the comment for the first time (not updating an existing one for a new commit),
    // we should generate an AI commit message for it.
    let shouldGenerateAiCommitMessage = false;

    if (makeComment) {
      const comment = await retrieveComment({ token: gitHostToken!, prNumber });

      // For now, let's set this true only if this is our first-ever run (so there wouldn't be a pre-existing comment).
      // In the future, we'll want to trigger this for *every* run until a user has manually edited the comment.
      if (
        enableAiCommitMessages &&
        comment.commitMessage == null &&
        comment.commitMessages == null
      ) {
        shouldGenerateAiCommitMessage = true;
      }

      // Load existing commit message(s) from comment
      if (enableAiCommitMessages && comment.commitMessages) {
        for (const [lang, commentCommitMessage] of Object.entries(
          comment.commitMessages,
        )) {
          commitMessages[lang] =
            makeCommitMessageConventional(commentCommitMessage);
        }
      } else if (comment.commitMessage) {
        commitMessage = comment.commitMessage;
      }
    }

    commitMessage = makeCommitMessageConventional(commitMessage);
    console.log("Using commit message:", commitMessage);

    const generator = runBuilds({
      stainless,
      oasContent: headConfig.oas,
      configContent: headConfig.config,
      baseOasContent: mergeBaseConfig.oas,
      baseConfigContent: mergeBaseConfig.config,
      projectName,
      branchFrom,
      baseBranch,
      branch,
      guessConfig: guessConfig ?? (!configPath && !!oasPath),
      commitMessage,
    });

    let latestRun: RunResult | null = null;
    const upsert = commentThrottler(gitHostToken!, prNumber);

    while (true) {
      const run = await generator.next();

      if (run.value) {
        latestRun = run.value;
      }

      if (makeComment && latestRun) {
        const { outcomes, baseOutcomes } = latestRun;

        // In case the comment was updated between polls:
        const comment = await retrieveComment({
          token: gitHostToken!,
          prNumber,
        });

        if (enableAiCommitMessages) {
          // Update commit messages from comment
          if (comment.commitMessages) {
            for (const [lang, commentCommitMessage] of Object.entries(
              comment.commitMessages,
            )) {
              commitMessages[lang] =
                makeCommitMessageConventional(commentCommitMessage);
            }
          }

          // Did any languages just complete a build?
          for (const lang of Object.keys(outcomes)) {
            // const commit = outcomes[lang].commit?.completed?.commit;

            console.log(`COMMIT: ${lang}: ${JSON.stringify(outcomes[lang].commit, null, 2)}`);
            // console.log(`COMMIT: ${lang}: ${JSON.stringify(baseOutcomes?.[lang].commit, null, 2)}`);

            const commit = outcomes[lang].commit?.completed?.commit;
            if (commit && shouldGenerateAiCommitMessage) {
              // const commit = outcomes[lang].commit.completed.commit;

              // const outcome = outcomes[lang];
              // console.log(
              //   `\nBUILD COMPLETED FOR ${lang}:\n ${JSON.stringify(outcome, null, 2)}\n`,
              // );
              console.log(
                `\nBUILD COMPLETED FOR ${lang}! SHA is ${commit.sha}\n`,
              );

              const baseRef = "base";
              const headRef = commit.sha;
              // commitMessages[lang] =
              //   (await generateAiCommitMessage(stainless, {
              //     target: lang,
              //     baseRef,
              //     headRef,
              //   })) || commitMessage;
            }
          }

          // console.log(latestRun.outcomes);

          // Use default message for any SDKs missing from comment (initial state for new comments)
          for (const lang of Object.keys(outcomes)) {
            if (!commitMessages[lang]) {
              commitMessages[lang] = commitMessage;
            }
          }
        } else {
          // Update commit message from comment
          if (comment.commitMessage) {
            commitMessage = makeCommitMessageConventional(
              comment.commitMessage,
            );
          }
        }

        const commentBody = printComment({
          orgName,
          projectName,
          branch,
          commitMessage,
          commitMessages: enableAiCommitMessages ? commitMessages : undefined,
          outcomes,
          baseOutcomes,
        });

        await upsert({ body: commentBody, force: run.done });
      }

      if (run.done) {
        if (!latestRun) {
          throw new Error("No latest run found after build finish");
        }

        const { outcomes, baseOutcomes, documentedSpec } = latestRun!;

        setOutput("outcomes", outcomes);
        setOutput("base_outcomes", baseOutcomes);

        if (documentedSpec && outputDir) {
          const documentedSpecPath = `${outputDir}/openapi.documented.yml`;
          fs.mkdirSync(outputDir, { recursive: true });
          fs.writeFileSync(documentedSpecPath, documentedSpec);
          setOutput("documented_spec_path", documentedSpecPath);
        }

        if (!shouldFailRun({ failRunOn, outcomes, baseOutcomes })) {
          process.exit(1);
        }

        break;
      }
    }
  } catch (error) {
    console.error("Error in preview action:", error);
    process.exit(1);
  }
}

async function computeBranchFrom({
  stainless,
  projectName,
  mergeBaseConfig,
  nonMainBaseRef,
  oasPath,
  configPath,
}: {
  stainless: Stainless;
  projectName: string;
  mergeBaseConfig: Config;
  nonMainBaseRef?: string;
  oasPath?: string;
  configPath?: string;
}) {
  const hashes: Record<string, { hash: string }> = {};

  if (mergeBaseConfig.oasHash) {
    hashes["openapi.yml"] = { hash: mergeBaseConfig.oasHash };
  }
  if (mergeBaseConfig.configHash) {
    hashes["stainless.yml"] = { hash: mergeBaseConfig.configHash };
  }
  if (
    (oasPath && !mergeBaseConfig.oasHash) ||
    (configPath && !mergeBaseConfig.configHash)
  ) {
    // We should only use the merge base to find a revision if all of the
    // specified files have a hash. In this case, one of the paths is
    // specified but the hash isn't in the merge base, so don't use it.
  } else {
    const configCommit = (
      await stainless.builds.list({
        project: projectName,
        branch: nonMainBaseRef ?? "main",
        revision: hashes,
        limit: 1,
      })
    ).data[0]?.config_commit;

    if (configCommit) {
      console.log(`Found base via merge base SHA: ${configCommit}`);
      return configCommit;
    }
  }

  if (nonMainBaseRef) {
    const configCommit = (
      await stainless.builds.list({
        project: projectName,
        branch: nonMainBaseRef,
        limit: 1,
      })
    ).data[0]?.config_commit;

    if (configCommit) {
      console.log(`Found base via non-main base ref: ${configCommit}`);
      return configCommit;
    }
  }

  const configCommit = (
    await stainless.builds.list({
      project: projectName,
      branch: "main",
      limit: 1,
    })
  ).data[0]?.config_commit;

  if (!configCommit) {
    throw new Error("Could not determine base revision");
  }

  console.log(`Found base via main branch: ${configCommit}`);
  return configCommit;
}

main();
