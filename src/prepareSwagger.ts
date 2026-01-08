import * as fs from "node:fs";
import * as path from "node:path";
import spawn from "nano-spawn";
import { getInput, getBooleanInput, setOutput } from "./compat";
import { logger } from "./logger";

async function convertSwagger(
  inputPath: string,
  outputPath: string,
  options: {
    patch: boolean;
    resolve: boolean;
    targetVersion: string;
    outputFormat?: string;
  },
) {
  logger.info(`Converting ${inputPath} to OpenAPI ${options.targetVersion}...`);

  const args: string[] = [inputPath];

  if (options.patch) {
    args.push("--patch");
  }

  if (options.resolve) {
    args.push("--resolve");
  }

  if (options.targetVersion === "3.1") {
    args.push("--warnOnly");
  }

  args.push("--outfile", outputPath);

  // Determine output format
  const format =
    options.outputFormat ||
    (outputPath.endsWith(".yaml") || outputPath.endsWith(".yml")
      ? "yaml"
      : "json");

  if (format === "yaml") {
    args.push("--yaml");
  }

  logger.info(`Running: npx swagger2openapi ${args.join(" ")}`);

  try {
    const result = await spawn("npx", ["swagger2openapi", ...args]);
    logger.info(`Conversion successful. Output written to ${outputPath}`);
    if (result.stdout) {
      logger.debug(result.stdout);
    }

    // For JSON output, reformat with proper indentation (2 spaces)
    if (format === "json") {
      logger.debug("Reformatting JSON with proper indentation...");
      const content = fs.readFileSync(outputPath, "utf-8");
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      fs.writeFileSync(outputPath, formatted + "\n", "utf-8");
      logger.debug("JSON reformatted successfully");
    }
  } catch (error: unknown) {
    logger.error("Conversion failed:", error);
    if (error && typeof error === "object" && "stderr" in error) {
      logger.error("stderr:", error.stderr);
    }
    throw new Error(
      `Failed to convert Swagger to OpenAPI: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function commitChanges(
  filePath: string,
  commitMessage: string,
  token: string,
) {
  logger.info(`Committing changes to ${filePath}...`);

  try {
    // Configure git user if not already configured
    try {
      await spawn("git", ["config", "user.name"]);
    } catch {
      await spawn("git", [
        "config",
        "user.name",
        "github-actions[bot]",
      ]);
    }

    try {
      await spawn("git", ["config", "user.email"]);
    } catch {
      await spawn("git", [
        "config",
        "user.email",
        "github-actions[bot]@users.noreply.github.com",
      ]);
    }

    // Add the file
    await spawn("git", ["add", filePath]);

    // Check if there are changes to commit
    const status = await spawn("git", ["status", "--porcelain"]);
    if (!status.stdout || status.stdout.trim().length === 0) {
      logger.info("No changes to commit");
      return;
    }

    // Commit the changes
    await spawn("git", ["commit", "-m", commitMessage]);
    logger.info("Changes committed successfully");

    // Push the changes
    if (token) {
      // Set up authentication for push
      const repoUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
      const repository = process.env.GITHUB_REPOSITORY;
      if (!repository) {
        throw new Error("GITHUB_REPOSITORY environment variable not set");
      }

      const authenticatedUrl = `${repoUrl.replace("https://", `https://x-access-token:${token}@`)}/${repository}.git`;
      const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;

      if (!branch) {
        throw new Error(
          "Could not determine branch name from GITHUB_HEAD_REF or GITHUB_REF_NAME",
        );
      }

      await spawn("git", ["push", authenticatedUrl, `HEAD:${branch}`]);
      logger.info("Changes pushed successfully");
    } else {
      logger.warn(
        "No GitHub token provided, skipping push. Changes are committed locally only.",
      );
    }
  } catch (error) {
    logger.error("Failed to commit changes:", error);
    throw new Error(
      `Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  try {
    const inputPath = getInput("input_path", { required: true });
    let outputPath = getInput("output_path", { required: false });
    const patch = getBooleanInput("patch", { required: false });
    const outputFormat = getInput("output_format", { required: false });
    const resolve = getBooleanInput("resolve", { required: false }) ?? true;
    const targetVersion = getInput("target_version", { required: false }) || "3.0";
    const shouldCommit = getBooleanInput("commit", { required: false });
    const commitMessage =
      getInput("commit_message", { required: false }) ||
      "chore: convert Swagger 2.0 to OpenAPI 3.x";
    const githubToken = getInput("github_token", { required: false });

    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(
        `Input file not found: ${inputPath}\n\n` +
        `Make sure:\n` +
        `1. You have checked out the repository using actions/checkout@v4\n` +
        `2. The file path is correct relative to the repository root\n` +
        `3. The file exists in your repository`,
      );
    }

    // Determine output path if not specified
    if (!outputPath) {
      const inputDir = path.dirname(inputPath);
      outputPath = path.join(inputDir, "openapi.json");
      logger.info(`Output path not specified, using: ${outputPath}`);
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Convert the file
    await convertSwagger(inputPath, outputPath, {
      patch,
      resolve,
      targetVersion,
      outputFormat,
    });

    // Set output
    setOutput("output_path", outputPath);

    // Commit changes if requested
    if (shouldCommit) {
      if (!githubToken) {
        logger.warn(
          "Commit requested but no github_token provided. Skipping commit.",
        );
      } else {
        await commitChanges(outputPath, commitMessage, githubToken);
      }
    }

    logger.info("Action completed successfully");
  } catch (error) {
    logger.error("Error:", error);
    process.exit(1);
  }
}

main();
