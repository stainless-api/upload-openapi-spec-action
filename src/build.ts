import { Stainless } from "@stainless-api/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { getBooleanInput, getInput, setOutput } from "./compat";
import { runBuilds } from "./runBuilds";

async function main() {
  try {
    const apiKey = getInput("stainless_api_key", { required: true });
    const oasPath = getInput("oas_path", { required: false }) || undefined;
    const configPath =
      getInput("config_path", { required: false }) || undefined;
    const projectName = getInput("project", { required: true });
    const commitMessage =
      getInput("commit_message", { required: false }) || undefined;
    const guessConfig =
      getBooleanInput("guess_config", { required: false }) || false;
    const branch = getInput("branch", { required: false }) || "main";
    const mergeBranch =
      getInput("merge_branch", { required: false }) || undefined;
    const baseRevision =
      getInput("base_revision", { required: false }) || undefined;
    const baseBranch =
      getInput("base_branch", { required: false }) || undefined;
    const outputDir = getInput("output_dir", { required: false }) || undefined;
    const documentedSpecOutputPath =
      getInput("documented_spec_path", { required: false }) || undefined;

    const stainless = new Stainless({
      project: projectName,
      apiKey,
      logLevel: "warn",
    });

    let documentedSpec: string | null = null;

    for await (const {
      outcomes,
      baseOutcomes,
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
      if (documentedSpecOutputPath && documentedSpecPath) {
        documentedSpec = readFileSync(documentedSpecPath, "utf8");
      }
    }

    if (documentedSpecOutputPath && documentedSpec) {
      // Decorated spec is currently always YAML, so convert it to JSON if needed.
      if (
        !(
          documentedSpecOutputPath.endsWith(".yml") ||
          documentedSpecOutputPath.endsWith(".yaml")
        )
      ) {
        documentedSpec = JSON.stringify(YAML.parse(documentedSpec), null, 2);
      }

      writeFileSync(documentedSpecOutputPath, YAML.stringify(documentedSpec));
    } else if (documentedSpecOutputPath) {
      console.error("No documented spec found.");
    }
  } catch (error) {
    console.error("Error interacting with API:", error);
    process.exit(1);
  }
}

main();
