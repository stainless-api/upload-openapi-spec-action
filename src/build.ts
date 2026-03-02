import { tmpdir } from "node:os";
import type { BuildParams } from "./build.run";
import { runBuild } from "./build.run";
import { makeCommitMessageConventional } from "./commitMessage";
import { api, ctx, getBooleanInput, getInput } from "./compat";
import { logger } from "./logger";
import { type MergeParams, runMerge } from "./merge.run";
import { FailRunOn } from "./outcomes";
import { type PreviewParams, runPreview } from "./preview.run";
import { wrapAction } from "./wrapAction";

const main = wrapAction("build", async (stainless) => {
  const params = {
    oasPath: getInput("oas_path", { required: false }),
    configPath: getInput("config_path", { required: false }),
    projectName: getInput("project", { required: true }),
    commitMessage: makeCommitMessageConventional(
      getInput("commit_message", { required: false }),
    ),
    guessConfig: getBooleanInput("guess_config", { required: false }) || false,
    branch: getInput("branch", { required: false }),
    mergeBranch: getInput("merge_branch", { required: false }),
    baseRevision: getInput("base_revision", { required: false }),
    baseBranch: getInput("base_branch", { required: false }),
    outputDir: getInput("output_dir", { required: false }) || tmpdir(),
    documentedSpecOutputPath: getInput("documented_spec_path", {
      required: false,
    }),
  } satisfies Omit<BuildParams, "branch"> & { branch?: string };

  const inferredPR =
    ctx().prNumber !== null
      ? await api({ optional: true })?.getPullRequest(ctx().prNumber!)
      : ctx().sha
        ? await api({ optional: true })?.getPullRequestForCommit(ctx().sha!)
        : null;

  if (inferredPR !== null) {
    logger.debug("Found PR for commit", inferredPR);
  }

  const orgName = getInput("org", { required: false });
  const defaultCommitMessage = params.commitMessage || inferredPR?.title;
  const defaultBranch =
    getInput("default_branch", { required: false }) || ctx().defaultBranch;

  if (!orgName || !defaultCommitMessage || !defaultBranch) {
    logger.debug(
      "No `org`, `commit_message`, or `default_branch` provided; not running preview / merge.",
      { orgName, defaultCommitMessage, defaultBranch },
    );
  } else if (inferredPR?.state === "open") {
    const previewParams = {
      orgName,
      projectName: params.projectName,
      oasPath: params.oasPath,
      configPath: params.configPath,
      defaultCommitMessage,
      guessConfig: params.guessConfig,
      failRunOn:
        getInput("fail_on", {
          choices: FailRunOn,
          required: false,
        }) || "error",
      makeComment: getBooleanInput("make_comment", { required: false }) ?? true,
      multipleCommitMessages: getBooleanInput("multiple_commit_messages", {
        required: false,
      }),
      baseSha: getInput("base_sha", { required: false }) ?? inferredPR.base_sha,
      baseRef: getInput("base_ref", { required: false }) ?? inferredPR.base_ref,
      baseBranch:
        getInput("base_branch", { required: false }) ??
        `preview/base/${inferredPR.head_ref}`,
      defaultBranch,
      headSha: getInput("head_sha", { required: false }) ?? inferredPR.head_sha,
      branch:
        (params.branch === "main" ? undefined : params.branch) ??
        `preview/${inferredPR.head_ref}`,
      outputDir: getInput("output_dir", { required: false }),
      prNumber: inferredPR.number,
    } satisfies PreviewParams;

    logger.info("Found open PR; dispatching to `preview`.", previewParams);
    return await runPreview(stainless, previewParams);
  } else if (inferredPR?.state === "merged") {
    const headSha =
      getInput("head_sha", { required: false }) ?? inferredPR.merge_commit_sha;
    if (headSha === null) {
      throw new Error("Expected merged PR to have a merge commit SHA.");
    }

    const mergeParams = {
      orgName,
      projectName: params.projectName,
      oasPath: params.oasPath,
      configPath: params.configPath,
      defaultCommitMessage,
      failRunOn:
        getInput("fail_on", {
          choices: FailRunOn,
          required: false,
        }) || "error",
      makeComment: getBooleanInput("make_comment", { required: false }) ?? true,
      multipleCommitMessages: getBooleanInput("multiple_commit_messages", {
        required: false,
      }),
      baseSha: getInput("base_sha", { required: false }) ?? inferredPR.base_sha,
      baseRef: getInput("base_ref", { required: false }) ?? inferredPR.base_ref,
      defaultBranch,
      headSha,
      mergeBranch:
        getInput("merge_branch", { required: false }) ??
        `preview/${inferredPR.head_ref}`,
      outputDir: getInput("output_dir", { required: false }),
      prNumber: inferredPR.number,
    } satisfies MergeParams;

    logger.info("Found merged PR; dispatching to `merge`.", mergeParams);
    return await runMerge(stainless, mergeParams);
  }

  if (ctx().refName === defaultBranch) {
    if (params.branch === undefined || params.branch === "main") {
      logger.info(
        "Push to default branch. Dispatching to `build` against `main`.",
        { branch: params.branch, defaultBranch },
      );
      return await runBuild(stainless, { ...params, branch: "main" });
    } else {
      logger.warn(
        "Push to default branch, but tried to build against non-main branch. This is likely a mistake; skipping.",
        { branch: params.branch, defaultBranch },
      );
      return;
    }
  } else if (params.branch === "main") {
    logger.warn(
      "Push to non-default branch, but tried to build against main branch. This is likely a mistake; skipping.",
      { branch: params.branch, defaultBranch },
    );
    return;
  } else if (params.branch !== undefined) {
    logger.info(
      "Push to non-default branch. Dispatching to `build` against explicit branch.",
      { branch: params.branch, defaultBranch },
    );
    return await runBuild(stainless, { ...params, branch: params.branch! });
  } else {
    logger.info(
      "Push to non-default branch without explicit branch. Skipping.",
    );
    return;
  }
});

main();
