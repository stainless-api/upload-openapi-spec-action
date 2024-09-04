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

export async function main() {
  // inputs
  const stainless_api_key = getInput('stainless_api_key', { required: true });
  const inputPath = getInput('input_path', { required: true });
  const configPath = getInput('config_path', { required: false });
  const projectName = getInput('project_name', { required: false });
  const commitMessage = getInput('commit_message', { required: false });
  const guessConfig = getBooleanInput('guess_config', { required: false });
  const branch = getInput('output_path', { required: false });
  const outputPath = getInput('output_path');

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

  const response = await fetch('https://api.stainlessapi.com/api/spec', {
    method: 'POST',
    body: formData,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-GitHub-Action': 'stainless-api/upload-openapi-spec-action',
    },
  });
  return response;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
