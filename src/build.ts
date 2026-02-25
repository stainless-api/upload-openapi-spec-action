import { tmpdir } from "node:os";
import { BuildParams, runBuild } from "./build.run";
import { makeCommitMessageConventional } from "./commitMessage";
import { getBooleanInput, getInput } from "./compat";
import { wrapAction } from "./wrapAction";

const main = wrapAction("build", async (stainless) => {
  const params = {
    oasPath: getInput("oas_path", { required: false }),
    configPath: getInput("config_path", { required: false }),
    projectName: getInput("project", { required: true }),
    commitMessage: makeCommitMessageConventional(
      getInput("commit_message", { required: false }) || undefined,
    ),
    guessConfig: getBooleanInput("guess_config", { required: false }) || false,
    branch: getInput("branch", { required: false }) || "main",
    mergeBranch: getInput("merge_branch", { required: false }),
    baseRevision: getInput("base_revision", { required: false }),
    baseBranch: getInput("base_branch", { required: false }),
    outputDir: getInput("output_dir", { required: false }) || tmpdir(),
    documentedSpecOutputPath:
      getInput("documented_spec_path", { required: false }) || undefined,
  } satisfies BuildParams;

  await runBuild(stainless, params);
});

main();
