import {
  getBooleanInput,
  getGitHostToken,
  getInput,
  getPRNumber,
  getStainlessAuthToken,
  isPullRequestOpenedEvent,
  setOutput,
} from "./compat";
import { logger } from "./logger";
import { Stainless } from "@stainless-api/sdk";
import * as fs from "node:fs";
import {
  commentThrottler,
  printComment,
  retrieveComment,
  upsertComment,
} from "./comment";
import { makeCommitMessageConventional } from "./commitMessage";
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
    const multipleCommitMessages = getBooleanInput("multiple_commit_messages", {
      required: false,
    });
    const gitHostToken = getGitHostToken();
    const baseSha = getInput("base_sha", { required: true });
    const baseRef = getInput("base_ref", { required: true });
    const baseBranch = getInput("base_branch", { required: true });
    const defaultBranch = getInput("default_branch", { required: true });
    const headSha = getInput("head_sha", { required: true });
    const branch = getInput("branch", { required: true });
    const outputDir = getInput("output_dir", { required: false }) || undefined;
    const prNumber = getPRNumber();

    // If we came from the checkout-pr-ref action, we might need to save the
    // generated config files.
    const { savedSha } = await saveConfig({
      oasPath,
      configPath,
    });
    if (savedSha !== null && savedSha !== headSha) {
      logger.warn(
        `Expected HEAD to be ${headSha}, but was ${savedSha}. This might cause issues with getting the head revision.`,
      );
    }

    const stainless = new Stainless({
      project: projectName,
      apiKey,
      logLevel: "warn",
    });

    logger.group("Getting parent revision");

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
      logger.info("No config files changed, skipping preview");

      // In this case, we only want to make a comment if there's an existing
      // comment---which can happen if the changes introduced by the PR
      // disappear for some reason.
      if (isPullRequestOpenedEvent() && makeComment) {
        logger.group("Updating comment");

        const commentBody = printComment({ noChanges: true });

        await upsertComment({
          body: commentBody,
          token: gitHostToken!,
          skipCreate: true,
          prNumber,
        });

        logger.groupEnd();
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

    logger.groupEnd();

    let commitMessage = defaultCommitMessage;
    const commitMessages: Record<string, string> = {};

    if (makeComment) {
      const comment = await retrieveComment({ token: gitHostToken!, prNumber });

      // Load existing commit message(s) from comment
      if (multipleCommitMessages && comment.commitMessages) {
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
    logger.info("Using commit message:", commitMessage);

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

        // Update commit message from comment
        if (comment.commitMessage) {
          commitMessage = makeCommitMessageConventional(comment.commitMessage);
        }

        if (multipleCommitMessages) {
          // Update commit messages from comment
          if (comment.commitMessages) {
            for (const [lang, commentCommitMessage] of Object.entries(
              comment.commitMessages,
            )) {
              commitMessages[lang] =
                makeCommitMessageConventional(commentCommitMessage);
            }
          }
        }

        if (multipleCommitMessages) {
          // Use default message for any SDKs missing from comment (initial state for new comments)
          for (const lang of Object.keys(outcomes)) {
            if (!commitMessages[lang]) {
              commitMessages[lang] = commitMessage;
            }
          }
        }

        const commentBody = printComment({
          orgName,
          projectName,
          branch,
          commitMessage,
          commitMessages: multipleCommitMessages ? commitMessages : undefined,
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
    logger.fatal("Error in preview action:", error);
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
      logger.debug(`Found base via merge base SHA: ${configCommit}`);
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
      logger.debug(`Found base via non-main base ref: ${configCommit}`);
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

  logger.debug(`Found base via main branch: ${configCommit}`);
  return configCommit;
}

main();
