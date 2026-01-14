/**
 * GitHub Action entry point for combining OpenAPI specs.
 */

import { getInput } from "../compat/input";
import { setOutput } from "../compat/output";
import { logger } from "../logger";
import { combineOpenAPISpecs, type ServerUrlStrategy } from "./combine";
import YAML from "yaml";

async function main() {
  try {
    const inputFiles = getInput("input_files", { required: true });
    const outputPath = getInput("output_path") || "./combined-openapi.yaml";
    const serverStrategyInput = getInput("server_url_strategy");

    logger.info(`Input patterns: ${inputFiles}`);
    logger.info(`Output path: ${outputPath}`);

    // Parse server URL strategy if provided
    let serverStrategy: ServerUrlStrategy | undefined;
    if (serverStrategyInput) {
      try {
        serverStrategy = YAML.parse(serverStrategyInput) as ServerUrlStrategy;
        logger.debug(`Server URL strategy: ${JSON.stringify(serverStrategy)}`);
      } catch (error) {
        throw new Error(`Failed to parse server_url_strategy YAML: ${error}`);
      }
    }

    const result = await combineOpenAPISpecs(
      inputFiles,
      outputPath,
      serverStrategy,
    );

    logger.info(`Total paths before combine: ${result.pathCountBefore}`);
    logger.info(`Total paths after combine: ${result.pathCountAfter}`);

    if (result.pathCountAfter !== result.pathCountBefore) {
      logger.warn(
        `Path count mismatch (before: ${result.pathCountBefore}, after: ${result.pathCountAfter})`,
      );
      logger.warn("Some paths may have been overwritten during combine.");
    }

    setOutput("combined_file", outputPath);
    setOutput("path_count", result.pathCountAfter.toString());

    logger.info(`Combine completed successfully`);
    logger.info(`Output file: ${outputPath}`);
  } catch (error) {
    logger.error("Error combining specs:", error);
    process.exit(1);
  }
}

main();
