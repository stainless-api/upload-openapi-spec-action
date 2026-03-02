import { Stainless } from "@stainless-api/sdk";
import * as fs from "node:fs";
import YAML from "yaml";
import { setOutput } from "./compat";
import { readConfig } from "./config";
import { logger } from "./logger";
import type { RunResult } from "./runBuilds";
import { runBuilds } from "./runBuilds";

export interface BuildParams {
  oasPath?: string;
  configPath?: string;
  projectName: string;
  commitMessage?: string;
  guessConfig: boolean;
  branch: string;
  mergeBranch?: string;
  baseRevision?: string;
  baseBranch?: string;
  outputDir: string;
  documentedSpecOutputPath?: string;
}

export async function runBuild(
  stainless: Stainless,
  params: BuildParams,
): Promise<void> {
  try {
    const {
      oasPath,
      configPath,
      projectName,
      commitMessage,
      guessConfig,
      branch,
      mergeBranch,
      baseRevision,
      baseBranch,
      outputDir,
      documentedSpecOutputPath,
    } = params;

    const config = await readConfig({ oasPath, configPath, required: true });

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
      logger.warn("No documented spec found.");
    }
  } catch (error) {
    if (
      error instanceof Stainless.BadRequestError &&
      error.message.includes("No changes to commit")
    ) {
      logger.info("No changes to commit, skipping build.");
      process.exit(0);
    } else {
      throw error;
    }
  }
}
