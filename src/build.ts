import { Stainless } from "@stainless-api/sdk";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { makeCommitMessageConventional } from "./commitMessage";
import { getBooleanInput, getInput, setOutput } from "./compat";
import { readConfig } from "./config";
import { runBuilds, RunResult } from "./runBuilds";

async function main() {
  try {
    const apiKey = getInput("stainless_api_key", { required: true });
    const oasPath = getInput("oas_path", { required: false }) || undefined;
    const configPath =
      getInput("config_path", { required: false }) || undefined;
    const projectName = getInput("project", { required: true });
    const commitMessage = makeCommitMessageConventional(
      getInput("commit_message", { required: false }) || undefined,
    );
    const guessConfig =
      getBooleanInput("guess_config", { required: false }) || false;
    const branch = getInput("branch", { required: false }) || "main";
    const mergeBranch =
      getInput("merge_branch", { required: false }) || undefined;
    const baseRevision =
      getInput("base_revision", { required: false }) || undefined;
    const baseBranch =
      getInput("base_branch", { required: false }) || undefined;
    const outputDir = getInput("output_dir", { required: false }) || tmpdir();
    const documentedSpecOutputPath =
      getInput("documented_spec_path", { required: false }) || undefined;

    const config = await readConfig({ oasPath, configPath, required: true });

    const stainless = new Stainless({
      project: projectName,
      apiKey,
      logLevel: "warn",
    });

    let lastValue: RunResult;

    for await (const value of runBuilds({
      stainless,
      projectName,
      branchFrom: baseRevision,
      baseBranch,
      mergeBranch,
      branch,
      oasContent: config.oas,
      configContent: config.config,
      guessConfig,
      commitMessage,
      allowEmpty: false,
    })) {
      lastValue = value;
    }

    const { baseOutcomes, outcomes, documentedSpec } = lastValue!;

    setOutput("outcomes", outcomes);
    setOutput("base_outcomes", baseOutcomes);

    if (documentedSpec && outputDir) {
      const documentedSpecPath = `${outputDir}/openapi.documented.yml`;
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(documentedSpecPath, documentedSpec);
      setOutput("documented_spec_path", documentedSpecPath);
    }

    if (documentedSpec && documentedSpecOutputPath) {
      // Decorated spec is currently always YAML, so convert it to JSON if needed.
      const documentedSpecOutput = !(
        documentedSpecOutputPath.endsWith(".yml") ||
        documentedSpecOutputPath.endsWith(".yaml")
      )
        ? JSON.stringify(YAML.parse(documentedSpec), null, 2)
        : documentedSpec;

      fs.writeFileSync(documentedSpecOutputPath, documentedSpecOutput);
    } else if (documentedSpecOutputPath) {
      console.error("No documented spec found.");
    }
  } catch (error) {
    if (
      error instanceof Stainless.BadRequestError &&
      error.message.includes("No changes to commit")
    ) {
      console.log("No changes to commit, skipping build.");
      process.exit(0);
    } else {
      console.error("Error interacting with API:", error);
      process.exit(1);
    }
  }
}

main();
