import { ctx, getBooleanInput, getInput } from "./compat";
import type { MergeParams } from "./merge.run";
import { runMerge } from "./merge.run";
import { FailRunOn } from "./outcomes";
import { wrapAction } from "./wrapAction";

const main = wrapAction("merge", async (stainless) => {
  const params = {
    orgName: getInput("org", { required: false }),
    projectName: getInput("project", { required: true }),
    oasPath: getInput("oas_path", { required: false }),
    configPath: getInput("config_path", { required: false }),
    defaultCommitMessage: getInput("commit_message", { required: true }),
    failRunOn: getInput("fail_on", {
      choices: FailRunOn,
      required: true,
    }),
    makeComment: getBooleanInput("make_comment", { required: true }),
    multipleCommitMessages: getBooleanInput("multiple_commit_messages", {
      required: false,
    }),
    baseSha: getInput("base_sha", { required: true }),
    baseRef: getInput("base_ref", { required: true }),
    defaultBranch: getInput("default_branch", { required: true }),
    headSha: getInput("head_sha", { required: true }),
    mergeBranch: getInput("merge_branch", { required: true }),
    outputDir: getInput("output_dir", { required: false }),
    prNumber: ctx().prNumber,
  } satisfies MergeParams;

  await runMerge(stainless, params);
});

main();
