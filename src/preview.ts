import { ctx, getBooleanInput, getInput } from "./compat";
import { FailRunOn } from "./outcomes";
import type { PreviewParams } from "./preview.run";
import { runPreview } from "./preview.run";
import { wrapAction } from "./wrapAction";

const main = wrapAction("preview", async (stainless) => {
  const params = {
    orgName: getInput("org", { required: true }),
    projectName: getInput("project", { required: true }),
    oasPath: getInput("oas_path", { required: false }),
    configPath: getInput("config_path", { required: false }),
    defaultCommitMessage: getInput("commit_message", { required: true }),
    guessConfig: getBooleanInput("guess_config", { required: false }),
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
    baseBranch: getInput("base_branch", { required: true }),
    defaultBranch: getInput("default_branch", { required: true }),
    headSha: getInput("head_sha", { required: true }),
    branch: getInput("branch", { required: true }),
    outputDir: getInput("output_dir", { required: false }),
    prNumber: ctx().prNumber,
  } satisfies PreviewParams;

  await runPreview(stainless, params);
});

main();
