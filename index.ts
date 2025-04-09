import { getBooleanInput, getInput } from '@actions/core';
import { error, info } from 'console';
import { writeFile } from 'fs-extra';
import fetch, { Response, fileFrom, FormData } from 'node-fetch';

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
  const projectName = getInputValue('project_name', { required: false });
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
    const text = await response.text();
    const errorMsg = `Failed to upload files: ${response.statusText} ${text}`;
    error(errorMsg);
    throw Error(errorMsg);
  }
  info('Uploaded!');

  if (outputPath) {
    const decoratedSpec = await response.text();
    writeFile(outputPath, decoratedSpec);
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
): Promise<Response> {
  const formData = new FormData();

  formData.set('projectName', projectName);

  if (commitMessage) {
    formData.set('commitMessage', commitMessage);
  }

  // append a spec file
  formData.set('oasSpec', await fileFrom(specPath, 'text/plain'));

  // append a config file, if present
  if (configPath) {
    formData.set('stainlessConfig', await fileFrom(configPath, 'text/plain'));
  }

  if (guessConfig) {
    formData.set('guessConfig', 'true');
  }

  if (branch) {
    formData.set('branch', branch);
  }

  // Determine which CI system is being used for headers
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (isGitLabCI()) {
    headers['X-GitLab-CI'] = 'stainless-api/upload-openapi-spec-action';
  } else {
    headers['X-GitHub-Action'] = 'stainless-api/upload-openapi-spec-action';
  }

  const response = await fetch('https://api.stainless.com/api/spec', {
    method: 'POST',
    body: formData,
    headers,
  });
  return response;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
