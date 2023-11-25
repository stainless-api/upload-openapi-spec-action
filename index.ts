import fs from 'fs';
import { getInput } from '@actions/core';
import { error, info } from 'console';
import { writeFile } from 'fs-extra';
import fetch from 'node-fetch';
import FormData from 'form-data';

export async function main() {
  // inputs
  const stainless_api_key = getInput('stainless_api_key', { required: true });
  const inputPath = getInput('input_path', { required: true });
  const configPath = getInput('config_path', { required: false });
  const outputPath = getInput('output_path');

  info('Uploading spec and config files...');
  const response = await uploadSpecAndConfig(inputPath, configPath, stainless_api_key);
  if (!response.ok) {
    const text = await response.text();
    const errorMsg = `Failed to upload spec or config file: ${response.statusText} ${text}`;
    error(errorMsg);
    throw Error(errorMsg);
  }

  if (outputPath) {
    const decoratedSpec = await response.text();
    writeFile(outputPath, decoratedSpec);
    info('Wrote decorated spec to', outputPath);
  }
}

async function uploadSpecAndConfig(specPath: string, configPath: string, token: string) {
  const formData = new FormData();

  // append a spec file
  const specStats = fs.statSync(specPath);
  formData.append('oasSpec', fs.createReadStream(specPath), {
    contentType: 'text/plain',
    knownLength: specStats.size,
  });

  // append a config file, if present
  if (configPath) {
    const configStats = fs.statSync(configPath);
    formData.append('stainlessConfig', fs.createReadStream(specPath), {
      contentType: 'text/plain',
      knownLength: configStats.size,
    });
  }

  const response = await fetch('https://api.stainlessapi.com/api/spec', {
    method: 'POST',
    body: formData,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
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
