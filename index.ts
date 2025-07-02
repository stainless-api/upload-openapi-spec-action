import { error, info, warn } from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import { getBooleanInput, getInput } from '@actions/core';
import Stainless from '@stainless-api/sdk';

// https://www.conventionalcommits.org/en/v1.0.0/
const CONVENTIONAL_COMMIT_REGEX = new RegExp(
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\(.*\))?(!?): .*$/,
);

export const isValidConventionalCommitMessage = (message: string) => {
  return CONVENTIONAL_COMMIT_REGEX.test(message);
};

// Detect if running in GitHub Actions or GitLab CI
function isGitLabCI(): boolean {
  return process.env['GITLAB_CI'] === 'true';
}

// Get input values from either GitHub Actions or GitLab CI environment
function getInputValue(name: string, options?: { required: boolean }): string {
  if (isGitLabCI()) {
    // Try GitLab-specific INPUT_ prefixed variable first (like GitHub Actions)
    const inputEnvName = `INPUT_${name.toUpperCase()}`;
    const inputValue = process.env[inputEnvName];

    // Fall back to direct name for backward compatibility
    const directEnvName = name.toUpperCase();
    const directValue = process.env[directEnvName];

    const value = inputValue || directValue;

    if (options?.required && !value) {
      throw new Error(`Input required and not supplied: ${name}`);
    }
    return value || '';
  } else {
    return getInput(name, options);
  }
}

// Get boolean input values from either GitHub Actions or GitLab CI environment
function getBooleanInputValue(name: string, options?: { required: boolean }): boolean {
  if (isGitLabCI()) {
    // Try GitLab-specific INPUT_ prefixed variable first (like GitHub Actions)
    const inputEnvName = `INPUT_${name.toUpperCase()}`;
    const inputValue = process.env[inputEnvName]?.toLowerCase();

    // Fall back to direct name for backward compatibility
    const directEnvName = name.toUpperCase();
    const directValue = process.env[directEnvName]?.toLowerCase();

    const value = inputValue || directValue;

    if (options?.required && value === undefined) {
      throw new Error(`Input required and not supplied: ${name}`);
    }
    return value === 'true';
  } else {
    return getBooleanInput(name, options);
  }
}

export async function main() {
  // inputs
  const stainless_api_key = getInputValue('stainless_api_key', { required: true });
  const inputPath = getInputValue('input_path', { required: true });
  const configPath = getInputValue('config_path', { required: false });
  let projectName = getInputValue('project_name', { required: false });
  const commitMessage = getInputValue('commit_message', { required: false });
  const guessConfig = getBooleanInputValue('guess_config', { required: false });
  const branch = getInputValue('branch', { required: false });
  const outputPath = getInputValue('output_path');

  if (configPath && guessConfig) {
    const errorMsg = "Can't set both configPath and guessConfig";
    error(errorMsg);
    throw Error(errorMsg);
  }

  if (commitMessage && !isValidConventionalCommitMessage(commitMessage)) {
    const errorMsg =
      'Invalid commit message format. Please follow the Conventional Commits format: https://www.conventionalcommits.org/en/v1.0.0/';
    error(errorMsg);
    throw Error(errorMsg);
  }

  if (!projectName) {
    const stainless = new Stainless({ apiKey: stainless_api_key });
    const projects = await stainless.projects.list({ limit: 2 });
    if (projects.data.length === 0) {
      const errorMsg = 'No projects found. Please create a project first.';
      error(errorMsg);
      throw Error(errorMsg);
    }
    projectName = projects.data[0]!.slug;
    if (projects.data.length > 1) {
      warn(
        `Multiple projects found. Using ${projectName} as default, but we recommend specifying the project name in the inputs.`,
      );
    }
  }

  info(configPath ? 'Uploading spec and config files...' : 'Uploading spec file...');
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
    const errorMsg = `Failed to upload files: ${response.error}`;
    error(errorMsg);
    throw Error(errorMsg);
  }
  info('Uploaded!');

  if (outputPath) {
    if (!response.decoratedSpec) {
      const errorMsg = 'Failed to get decorated spec';
      error(errorMsg);
      throw Error(errorMsg);
    }
    writeFileSync(outputPath, response.decoratedSpec);
    info('Wrote decorated spec to', outputPath);
  }
}

async function uploadSpecAndConfig(
  specPath: string,
  configPath: string,
  token: string,
  projectName: string,
  commitMessage: string,
  guessConfig: boolean,
  branch: string,
): Promise<{
  ok: boolean;
  error: string | null;
  decoratedSpec: string | null;
}> {
  const stainless = new Stainless({ apiKey: token, project: projectName });
  const specContent = readFileSync(specPath, 'utf8');

  let configContent;

  if (guessConfig) {
    configContent = Object.values(
      await stainless.projects.configs.guess({
        branch,
        spec: specContent,
      }),
    )[0]?.content;
  } else if (configPath) {
    configContent = readFileSync(configPath, 'utf8');
  }

  const headers: Record<string, string> = {};
  if (isGitLabCI()) {
    headers['X-GitLab-CI'] = 'stainless-api/upload-openapi-spec-action';
  } else {
    headers['X-GitHub-Action'] = 'stainless-api/upload-openapi-spec-action';
  }

  let build = await stainless.builds.create(
    {
      ...(branch && { branch }),
      ...(commitMessage && { commit_message: commitMessage }),
      revision: {
        'openapi.yml': { content: specContent },
        ...(configContent && { 'openapi.stainless.yml': { content: configContent } }),
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
      (target) => (target as Stainless.BuildTarget).commit.status === 'completed',
    );
    if (!donePolling) {
      await new Promise((resolve) => setTimeout(resolve, 5 * 1000));
    }
  }

  const failedTargets = (Object.values(build.targets) as Stainless.BuildTarget[]).filter(
    (target) =>
      target.commit?.status !== 'completed' ||
      // The remaining possible conclusions ('merge_conflict', 'fatal', 'payment_required', etc.) should
      // all be considered failures.
      !['noop', 'error', 'warning', 'note', 'success'].includes(target.commit.completed.conclusion),
  );
  const ok = failedTargets.length === 0;
  const error = ok
    ? null
    : failedTargets[0]!.commit.status === 'completed'
    ? failedTargets[0]!.commit.completed.conclusion
    : 'timed_out';

  // TODO: API only returns "content" for now; need to support "url" in the future
  const decoratedSpec = build.documented_spec?.type === 'content' ? build.documented_spec.content : null;

  return { ok, error, decoratedSpec };
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
