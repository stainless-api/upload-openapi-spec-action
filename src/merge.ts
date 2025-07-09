import {
  endGroup,
  getBooleanInput,
  getInput,
  setOutput,
  startGroup,
} from "@actions/core";
import { Stainless } from "@stainless-api/sdk";
import { checkResults, runBuilds, RunResult } from "./build";
import { printComment, retrieveComment, upsertComment } from "./comment";
import { isConfigChanged } from "./config";

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
    const githubToken = getInput("github_token", { required: false });
    const baseSha = getInput("base_sha", { required: true });
    const baseRef = getInput("base_ref", { required: true });
    const defaultBranch = getInput("default_branch", { required: true });
    const headSha = getInput("head_sha", { required: true });
    const mergeBranch = getInput("merge_branch", { required: true });
    const outputDir = getInput("output_dir", { required: false }) || undefined;

    if (makeComment && !githubToken) {
      throw new Error("github_token is required to make a comment");
    }

    if (baseRef !== defaultBranch) {
      console.log("Not merging to default branch, skipping merge");
      return;
    }

    const stainless = new Stainless({
      project: projectName,
      apiKey,
      logLevel: "warn",
    });

    const configChanged = await isConfigChanged({
      before: baseSha,
      after: headSha,
      oasPath,
      configPath,
    });

    if (!configChanged) {
      console.log("No config files changed, skipping merge");
      return;
    }

    let commitMessage = defaultCommitMessage;

    if (makeComment && githubToken) {
      const comment = await retrieveComment({ token: githubToken });
      if (comment.commitMessage) {
        commitMessage = comment.commitMessage;
      }
    }

    console.log("Using commit message:", commitMessage);

    const generator = runBuilds({
      stainless,
      projectName,
      commitMessage,
      // This action always merges to the Stainless `main` branch:
      branch: "main",
      mergeBranch,
      guessConfig: false,
      outputDir,
    });

    let latestRun: RunResult;

    while (true) {
      startGroup("Running builds");

      const run = await generator.next();

      endGroup();

      if (run.done) {
        const { outcomes, documentedSpecPath } = latestRun!;

        setOutput("outcomes", outcomes);
        setOutput("documented_spec_path", documentedSpecPath);

        if (!checkResults({ outcomes, failRunOn })) {
          process.exit(1);
        }

        break;
      }

      latestRun = run.value;

      if (makeComment) {
        const { outcomes } = latestRun;

        startGroup("Updating comment");

        const commentBody = printComment({
          orgName,
          projectName,
          branch: "main",
          commitMessage,
          outcomes,
        });

        await upsertComment({ body: commentBody, token: githubToken });

        endGroup();
      }
    }
  } catch (error) {
    console.error("Error in merge action:", error);
    process.exit(1);
  }
}

main();
