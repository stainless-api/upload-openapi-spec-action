import {
  getBooleanInput,
  getGitHostToken,
  getInput,
  getPRNumber,
  setOutput,
} from "./compat";
import { Stainless } from "@stainless-api/sdk";
import * as fs from "node:fs";
import { commentThrottler, printComment, retrieveComment } from "./comment";
import { makeCommitMessageConventional } from "./commitMessage";
import { isConfigChanged, readConfig } from "./config";
import { checkResults, runBuilds, RunResult } from "./runBuilds";

async function main() {
  try {
    const apiKey = getInput("stainless_api_key", { required: true });
    const orgName = getInput("org", { required: false });
    const projectName = getInput("project", { required: true });
    const oasPath = getInput("oas_path", { required: false });
    const configPath =
      getInput("config_path", { required: false }) || undefined;
    const defaultCommitMessage = getInput("commit_message", { required: true });
    const failRunOn = getInput("fail_on", { required: true }) || "error";
    const makeComment = getBooleanInput("make_comment", { required: true });
    const gitHostToken = getGitHostToken();
    const baseSha = getInput("base_sha", { required: true });
    const baseRef = getInput("base_ref", { required: true });
    const defaultBranch = getInput("default_branch", { required: true });
    const headSha = getInput("head_sha", { required: true });
    const mergeBranch = getInput("merge_branch", { required: true });
    const outputDir = getInput("output_dir", { required: false }) || undefined;
    const prNumber = getPRNumber();

    if (baseRef !== defaultBranch) {
      console.log("Not merging to default branch, skipping merge");
      return;
    }

    if (makeComment && !getPRNumber()) {
      throw new Error(
        "This action requires a pull request number to make a comment.",
      );
    }

    const stainless = new Stainless({
      project: projectName,
      apiKey,
      logLevel: "warn",
    });

    const baseConfig = await readConfig({ oasPath, configPath, sha: baseSha });
    const headConfig = await readConfig({ oasPath, configPath, sha: headSha });
    const configChanged = await isConfigChanged({
      before: baseConfig,
      after: headConfig,
    });

    if (!configChanged) {
      console.log("No config files changed, skipping merge");
      return;
    }

    let commitMessage = defaultCommitMessage;

    if (makeComment && gitHostToken) {
      const comment = await retrieveComment({ token: gitHostToken, prNumber });
      if (comment.commitMessage) {
        commitMessage = comment.commitMessage;
      }
    }

    commitMessage = makeCommitMessageConventional(commitMessage);
    console.log("Using commit message:", commitMessage);

    const generator = runBuilds({
      stainless,
      projectName,
      commitMessage,
      // This action always merges to the Stainless `main` branch:
      branch: "main",
      mergeBranch,
      guessConfig: false,
    });

    let latestRun: RunResult;
    const upsert = commentThrottler(gitHostToken, prNumber);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const run = await generator.next();

      if (run.value) {
        latestRun = run.value;
      }

      if (makeComment) {
        const { outcomes } = latestRun!;

        const commentBody = printComment({
          orgName,
          projectName,
          branch: "main",
          commitMessage,
          outcomes,
        });

        await upsert({ body: commentBody, force: run.done });
      }

      if (run.done) {
        const { outcomes, documentedSpec } = latestRun!;

        setOutput("outcomes", outcomes);

        if (documentedSpec && outputDir) {
          const documentedSpecPath = `${outputDir}/openapi.documented.yml`;
          fs.mkdirSync(outputDir, { recursive: true });
          fs.writeFileSync(documentedSpecPath, documentedSpec);
          setOutput("documented_spec_path", documentedSpecPath);
        }

        if (!checkResults({ outcomes, failRunOn })) {
          process.exit(1);
        }

        break;
      }
    }
  } catch (error) {
    console.error("Error in merge action:", error);
    process.exit(1);
  }
}

main();
