import Stainless from "@stainless-api/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import {
  getBooleanInput,
  getInput,
  isGitLabCI,
  getStainlessAuthToken,
} from "./compat";
import { logger } from "./logger";

// https://www.conventionalcommits.org/en/v1.0.0/
const CONVENTIONAL_COMMIT_REGEX = new RegExp(
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\(.*\))?(!?): .*$/,
);

export const isValidConventionalCommitMessage = (message: string) => {
  return CONVENTIONAL_COMMIT_REGEX.test(message);
};

export async function main() {
  // inputs
  const stainless_api_key = await getStainlessAuthToken();
  const inputPath = getInput("input_path", { required: true });
  const configPath = getInput("config_path", { required: false });
  let projectName = getInput("project_name", { required: false });
  const commitMessage = getInput("commit_message", { required: false });
  const guessConfig =
    getBooleanInput("guess_config", { required: false }) || false;
  const branch = getInput("branch", { required: false }) || "main";
  const outputPath = getInput("output_path");

  if (configPath && guessConfig) {
    const errorMsg = "Can't set both configPath and guessConfig";
    logger.error(errorMsg);
    throw Error(errorMsg);
  }

  if (commitMessage && !isValidConventionalCommitMessage(commitMessage)) {
    const errorMsg =
      "Invalid commit message format. Please follow the Conventional Commits format: https://www.conventionalcommits.org/en/v1.0.0/";
    logger.error(errorMsg);
    throw Error(errorMsg);
  }

  if (!projectName) {
    const stainless = new Stainless({ apiKey: stainless_api_key });
    const projects = await stainless.projects.list({ limit: 2 });
    if (projects.data.length === 0) {
      const errorMsg = "No projects found. Please create a project first.";
      logger.error(errorMsg);
      throw Error(errorMsg);
    }
    projectName = projects.data[0]!.slug;
    if (projects.data.length > 1) {
      logger.warn(
        `Multiple projects found. Using ${projectName} as default, but we recommend specifying the project name in the inputs.`,
      );
    }
  }

  logger.info(
    configPath
      ? "Uploading spec and config files..."
      : "Uploading spec file...",
  );
  const response = await uploadSpecAndConfig(
    inputPath,
    configPath,
    stainless_api_key,
    projectName,
    commitMessage,
    guessConfig,
    branch,
  );
  if (!response.ok) {
    const errorMsg = `Build failed with the following outcomes: ${JSON.stringify(
      response.errors,
    )} See more details in the Stainless Studio.`;
    logger.error(errorMsg);
    throw Error(errorMsg);
  }
  logger.info("Uploaded!");

  if (outputPath) {
    if (!response.decoratedSpec) {
      const errorMsg = "Failed to get decorated spec";
      logger.error(errorMsg);
      throw Error(errorMsg);
    }
    // Decorated spec is currently always YAML, so convert it to JSON if needed.
    if (!(outputPath.endsWith(".yml") || outputPath.endsWith(".yaml"))) {
      response.decoratedSpec = JSON.stringify(
        YAML.parse(response.decoratedSpec),
        null,
        2,
      );
    }
    writeFileSync(outputPath, response.decoratedSpec);
    logger.info(`Wrote decorated spec to ${outputPath}`);
  }
}

async function uploadSpecAndConfig(
  specPath: string,
  configPath: string | undefined,
  token: string,
  projectName: string,
  commitMessage: string | undefined,
  guessConfig: boolean,
  branch: string,
): Promise<{
  ok: boolean;
  errors: Array<{
    target: keyof Stainless.BuildObject.Targets;
    outcome: string;
  }>;
  decoratedSpec: string | null;
}> {
  const stainless = new Stainless({ apiKey: token, project: projectName });
  const specContent = readFileSync(specPath, "utf8");

  let configContent;

  if (guessConfig) {
    configContent = Object.values(
      await stainless.projects.configs.guess({
        branch,
        spec: specContent,
      }),
    )[0]?.content;
  } else if (configPath) {
    configContent = readFileSync(configPath, "utf8");
  }

  const headers: Record<string, string> = {};
  if (isGitLabCI()) {
    headers["X-GitLab-CI"] = "stainless-api/upload-openapi-spec-action";
  } else {
    headers["X-GitHub-Action"] = "stainless-api/upload-openapi-spec-action";
  }

  let build = await stainless.builds.create(
    {
      ...(branch && { branch }),
      ...(commitMessage && { commit_message: commitMessage }),
      revision: {
        "openapi.yml": { content: specContent },
        ...(configContent && {
          "openapi.stainless.yml": { content: configContent },
        }),
      },
      allow_empty: true,
    },
    { headers },
  );

  const pollingStart = Date.now();
  let donePolling = false;
  while (!donePolling && Date.now() - pollingStart < 10 * 60 * 1000) {
    build = await stainless.builds.retrieve(build.id);
    donePolling = Object.values(build.targets).every(
      (target) =>
        (target as Stainless.BuildTarget).commit.status === "completed",
    );
    if (!donePolling) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
    }
  }

  const errors = (
    Object.entries(build.targets) as [
      keyof Stainless.BuildObject.Targets,
      Stainless.BuildTarget,
    ][]
  )
    .map(([target, value]) => {
      if (
        // The remaining possible conclusions ('fatal', 'payment_required', etc.) should
        // all be considered failures.
        value.commit?.status === "completed" &&
        [
          "merge_conflict",
          "noop",
          "error",
          "warning",
          "note",
          "success",
        ].includes(value.commit.completed.conclusion)
      ) {
        return undefined;
      } else if (value.commit?.status === "completed") {
        return {
          target,
          outcome: value.commit.completed.conclusion,
        };
      } else {
        return {
          target,
          outcome: "timed_out",
        };
      }
    })
    .filter((e) => e !== undefined) as Array<{
    target: keyof Stainless.BuildObject.Targets;
    outcome: string;
  }>;
  const ok = errors.length === 0;
  const decoratedSpec = await Stainless.unwrapFile(build.documented_spec);

  return { ok, errors, decoratedSpec };
}

if (require.main === module) {
  main().catch((err) => {
    logger.fatal("Fatal error:", err);
    process.exit(1);
  });
}
