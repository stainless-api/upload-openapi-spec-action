import * as fs from "node:fs";
import { commentThrottler, printComment, retrieveComment } from "./comment";
import { makeCommitMessageConventional } from "./commitMessage";
import { api, ctx, getBooleanInput, getInput, setOutput } from "./compat";
import { isConfigChanged, readConfig, saveConfig } from "./config";
import { logger } from "./logger";
import { FailRunOn, shouldFailRun } from "./outcomes";
import type { RunResult } from "./runBuilds";
import { runBuilds } from "./runBuilds";
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
  const baseSha = getInput("base_sha", { required: true });
  const baseRef = getInput("base_ref", { required: true });
  const defaultBranch = getInput("default_branch", { required: true });
  const headSha = getInput("head_sha", { required: true });
  const mergeBranch = getInput("merge_branch", { required: true });
  const outputDir = getInput("output_dir", { required: false }) || undefined;
  const prNumber = ctx().prNumber;

  if (baseRef !== defaultBranch) {
    logger.info("Not merging to default branch, skipping merge");
    return;
  }

  if (makeComment && prNumber === null) {
    throw new Error(
      "This action requires a pull request number to make a comment.",
    );
  }

  if (makeComment && !orgName) {
    throw new Error(
      "This action requires an organization name to make a comment.",
    );
  }

  if (makeComment && api({ optional: true }) === null) {
    throw new Error("This action requires an API token to make a comment.");
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

  const enableAiCommitMessages =
    orgName &&
    (await stainless.orgs
      .retrieve(orgName)
      .then((org) => org.enable_ai_commit_messages)
      .catch((err) => {
        logger.warn(`Could not fetch data for ${orgName}.`, err);
        return false;
      }));
  if (enableAiCommitMessages) {
    if (multipleCommitMessages === false) {
      logger.warn(
        'AI commit messages are enabled, but "multiple_commit_messages" is set to false. Overriding to true.',
      );
    } else if (multipleCommitMessages === undefined) {
      logger.info(
        'AI commit messages are enabled; setting "multiple_commit_messages" to true.',
      );
    }
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

  const comment = makeComment ? await retrieveComment() : null;
  const commitMessage =
    comment?.commitMessage ??
    makeCommitMessageConventional(defaultCommitMessage);
  const targetCommitMessages = multipleCommitMessages
    ? (comment?.targetCommitMessages ?? {})
    : undefined;

  if (targetCommitMessages) {
    logger.info("Using commit messages:", targetCommitMessages);
    logger.info("With default commit message:", commitMessage);
  } else {
    logger.info("Using commit message:", commitMessage);
  }

  const generator = runBuilds({
    stainless,
    projectName,
    commitMessage,
    targetCommitMessages,
    // This action always merges to the Stainless `main` branch:
    branch: "main",
    mergeBranch,
    guessConfig: false,
  });

  let latestRun: RunResult | null = null;
  const upsert = prNumber ? commentThrottler() : null;

  while (true) {
    const run = await generator.next();

    if (run.value) {
      latestRun = run.value;
    }

    if (makeComment && latestRun && upsert) {
      const { outcomes } = latestRun;

      const commentBody = printComment({
        orgName: orgName!,
        projectName,
        branch: "main",
        commitMessage,
        targetCommitMessages,
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
