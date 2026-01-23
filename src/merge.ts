import {
  getBooleanInput,
  getGitHostToken,
  getInput,
  getPRNumber,
  setOutput,
} from "./compat";
import { logger } from "./logger";
import * as fs from "node:fs";
import { commentThrottler, printComment, retrieveComment } from "./comment";
import { makeCommitMessageConventional } from "./commitMessage";
import { isConfigChanged, readConfig, saveConfig } from "./config";
import { shouldFailRun, FailRunOn } from "./outcomes";
import { runBuilds } from "./runBuilds";
import type { RunResult } from "./runBuilds";
import { wrapAction } from "./wrapAction";

const main = wrapAction("merge", async (stainless) => {
  const orgName = getInput("org", { required: false });
  const projectName = getInput("project", { required: true });
  const oasPath = getInput("oas_path", { required: false });
  const configPath = getInput("config_path", { required: false }) || undefined;
  const defaultCommitMessage = getInput("commit_message", { required: true });
  const failRunOn = getInput("fail_on", {
    choices: FailRunOn,
    required: true,
  });
  const makeComment = getBooleanInput("make_comment", { required: true });
  let multipleCommitMessages = getBooleanInput("multiple_commit_messages", {
    required: false,
  });
  const gitHostToken = getGitHostToken();
  const baseSha = getInput("base_sha", { required: true });
  const baseRef = getInput("base_ref", { required: true });
  const defaultBranch = getInput("default_branch", { required: true });
  const headSha = getInput("head_sha", { required: true });
  const mergeBranch = getInput("merge_branch", { required: true });
  const outputDir = getInput("output_dir", { required: false }) || undefined;
  const prNumber = getPRNumber();

  if (baseRef !== defaultBranch) {
    logger.info("Not merging to default branch, skipping merge");
    return;
  }

  if (makeComment && !getPRNumber()) {
    throw new Error(
      "This action requires a pull request number to make a comment.",
    );
  }

  if (makeComment && !orgName) {
    throw new Error(
      "This action requires an organization name to make a comment.",
    );
  }

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

  // Fetch org data to check enable_ai_commit_messages field
  let org: { enable_ai_commit_messages: boolean } | null = null;
  if (orgName) {
    try {
      org = (await stainless.get(`/v0/orgs/${orgName}`)) as {
        enable_ai_commit_messages: boolean;
      };
    } catch (error) {
      logger.warn(
        `Failed to fetch org data for ${orgName}. AI commit messages will be disabled.`,
        error,
      );
    }
  }

  // Enable AI commit messages if org setting is enabled
  if (org?.enable_ai_commit_messages) {
    multipleCommitMessages = true;
  }

  const baseConfig = await readConfig({ oasPath, configPath, sha: baseSha });
  const headConfig = await readConfig({ oasPath, configPath, sha: headSha });
  const configChanged = await isConfigChanged({
    before: baseConfig,
    after: headConfig,
  });

  if (!configChanged) {
    logger.info("No config files changed, skipping merge");
    return;
  }

  let commitMessage = defaultCommitMessage;
  // Per-SDK commit messages (only used when multiple_commit_messages is enabled)
  const commitMessages: Record<string, string> = {};

  if (makeComment && gitHostToken) {
    const comment = await retrieveComment({ token: gitHostToken, prNumber });

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
    projectName,
    commitMessage,
    commitMessages,
    // This action always merges to the Stainless `main` branch:
    branch: "main",
    mergeBranch,
    guessConfig: false,
  });

  let latestRun: RunResult | null = null;
  const upsert = commentThrottler(gitHostToken!, prNumber);

  while (true) {
    const run = await generator.next();

    if (run.value) {
      latestRun = run.value;
    }

    if (makeComment && latestRun) {
      const { outcomes } = latestRun;

      if (multipleCommitMessages) {
        // For any SDKs that don't have commit messages, use the default
        for (const lang of Object.keys(outcomes)) {
          if (!commitMessages[lang]) {
            commitMessages[lang] = commitMessage;
          }
        }
      }

      const commentBody = printComment({
        orgName: orgName!,
        projectName,
        branch: "main",
        commitMessage,
        commitMessages: multipleCommitMessages ? commitMessages : undefined,
        outcomes,
      });

      await upsert({ body: commentBody, force: run.done });
    }

    if (run.done) {
      if (!latestRun) {
        throw new Error("No latest run found after build finish");
      }

      const { outcomes, documentedSpec } = latestRun;

      setOutput("outcomes", outcomes);

      if (documentedSpec && outputDir) {
        const documentedSpecPath = `${outputDir}/openapi.documented.yml`;
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(documentedSpecPath, documentedSpec);
        setOutput("documented_spec_path", documentedSpecPath);
      }

      if (!shouldFailRun({ failRunOn, outcomes })) {
        process.exit(1);
      }

      break;
    }
  }
});

main();
