import {
  endGroup,
  getBooleanInput,
  getInput,
  setOutput,
  startGroup,
} from "@actions/core";
import * as github from "@actions/github";
import { Stainless } from "@stainless-api/sdk";
import { printComment, retrieveComment, upsertComment } from "./comment";
import {
  Config,
  getMergeBase,
  getNonMainBaseRef,
  isConfigChanged,
  readConfig,
  saveConfig,
} from "./config";
import { checkResults, runBuilds, RunResult } from "./runBuilds";

async function main() {
  try {
    const apiKey = getInput("stainless_api_key", { required: true });
    const orgName = getInput("org", { required: true });
    const projectName = getInput("project", { required: true });
    const oasPath = getInput("oas_path", { required: true });
    const configPath =
      getInput("config_path", { required: false }) || undefined;
    const defaultCommitMessage = getInput("commit_message", { required: true });
    const failRunOn = getInput("fail_on", { required: true }) || "error";
    const makeComment = getBooleanInput("make_comment", { required: true });
    const githubToken = getInput("github_token", { required: false });
    const baseSha = getInput("base_sha", { required: true });
    const baseRef = getInput("base_ref", { required: true });
    const baseBranch = getInput("base_branch", { required: true });
    const defaultBranch = getInput("default_branch", { required: true });
    const headSha = getInput("head_sha", { required: true });
    const branch = getInput("branch", { required: true });

    if (makeComment && !githubToken) {
      throw new Error("github_token is required to make a comment");
    }

    // If we came from the checkout-base action, we might need to save the
    // generated config files.
    const { savedSha } = await saveConfig({ oasPath, configPath });

    const stainless = new Stainless({
      project: projectName,
      apiKey,
      logLevel: "warn",
    });

    startGroup("Getting parent revision");

    const { mergeBaseSha } = await getMergeBase({ baseSha, headSha });
    if (savedSha !== null && savedSha !== mergeBaseSha) {
      throw new Error(
        `Expected HEAD to be ${mergeBaseSha}, but was ${savedSha}`,
      );
    }

    const { nonMainBaseRef } = await getNonMainBaseRef({
      baseRef,
      defaultBranch,
    });

    const mergeBaseConfig = await readConfig({
      oasPath,
      configPath,
      sha: mergeBaseSha,
    });
    const headConfig = await readConfig({ oasPath, configPath, sha: headSha });
    const configChanged = await isConfigChanged({
      before: mergeBaseConfig,
      after: headConfig,
    });

    if (!configChanged) {
      console.log("No config files changed, skipping preview");

      // In this case, we only want to make a comment if there's an existing
      // comment---which can happen if the changes introduced by the PR
      // disappear for some reason.
      if (
        github.context.payload.pull_request!.action !== "opened" &&
        makeComment
      ) {
        startGroup("Updating comment");

        const commentBody = printComment({ noChanges: true });

        await upsertComment({
          body: commentBody,
          token: githubToken,
          skipCreate: true,
        });

        endGroup();
      }

      return;
    }

    const baseRevision = await computeBaseRevision({
      stainless,
      projectName,
      mergeBaseConfig,
      nonMainBaseRef,
      oasPath,
      configPath,
    });

    endGroup();

    let commitMessage = defaultCommitMessage;

    if (makeComment) {
      const comment = await retrieveComment({ token: githubToken });
      if (comment.commitMessage) {
        commitMessage = comment.commitMessage;
      }
    }

    console.log("Using commit message:", commitMessage);

    const generator = runBuilds({
      stainless,
      oasContent: headConfig.oas,
      configContent: headConfig.config,
      projectName,
      baseRevision,
      baseBranch,
      branch,
      guessConfig: !configPath,
      commitMessage,
    });

    let latestRun: RunResult;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      startGroup("Running builds");

      const run = await generator.next();

      endGroup();

      if (run.done) {
        const { outcomes, baseOutcomes } = latestRun!;

        setOutput("outcomes", outcomes);
        setOutput("base_outcomes", baseOutcomes);

        if (!checkResults({ outcomes, failRunOn })) {
          process.exit(1);
        }

        break;
      }

      latestRun = run.value;

      if (makeComment) {
        const { outcomes, baseOutcomes } = latestRun;

        startGroup("Updating comment");

        // In case the comment was updated between polls:
        const comment = await retrieveComment({ token: githubToken });
        if (comment.commitMessage) {
          commitMessage = comment.commitMessage;
        }

        const commentBody = printComment({
          orgName,
          projectName,
          branch,
          commitMessage,
          outcomes,
          baseOutcomes,
        });

        await upsertComment({ body: commentBody, token: githubToken });

        endGroup();
      }
    }
  } catch (error) {
    console.error("Error in preview action:", error);
    process.exit(1);
  }
}

async function computeBaseRevision({
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
