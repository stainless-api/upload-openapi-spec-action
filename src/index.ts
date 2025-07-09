import { getBooleanInput, getInput, setOutput } from "@actions/core";
import { Stainless } from "@stainless-api/sdk";
import { runBuilds } from "./build";

async function main() {
  try {
    const apiKey = getInput("stainless_api_key", { required: true });
    const oasPath = getInput("oas_path", { required: false }) || undefined;
    const configPath =
      getInput("config_path", { required: false }) || undefined;
    const projectName = getInput("project", { required: true });
    const commitMessage =
      getInput("commit_message", { required: false }) || undefined;
    const guessConfig = getBooleanInput("guess_config", { required: false });
    const branch = getInput("branch", { required: false }) || undefined;
    const mergeBranch =
      getInput("merge_branch", { required: false }) || undefined;
    const baseRevision =
      getInput("base_revision", { required: false }) || undefined;
    const baseBranch =
      getInput("base_branch", { required: false }) || undefined;
    const outputDir = getInput("output_dir", { required: false }) || undefined;

    const stainless = new Stainless({
      project: projectName,
      apiKey,
      logLevel: "warn",
    });

    for await (const {
      baseOutcomes,
      outcomes,
      documentedSpecPath,
    } of runBuilds({
      stainless,
      projectName,
      baseRevision,
      baseBranch,
      mergeBranch,
      branch,
      oasPath,
      configPath,
      guessConfig,
      commitMessage,
      outputDir,
    })) {
      setOutput("outcomes", outcomes);
      setOutput("base_outcomes", baseOutcomes);
      setOutput("documented_spec_path", documentedSpecPath);
    }
  } catch (error) {
    console.error("Error interacting with API:", error);
    process.exit(1);
  }
}

main();
