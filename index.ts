import { getInput } from '@actions/core';
import { error, info } from 'console';
import { readFile, writeFile } from 'fs-extra';
import fetch from 'node-fetch';

export async function main() {
  // inputs
  const stainless_api_key = getInput('stainless_api_key', { required: true });
  const input_path = getInput('input_path', { required: true });
  const output_path = getInput('output_path');

  const raw_spec = await loadSpec(input_path);
  const decoratedSpec = await decorateSpec(raw_spec, stainless_api_key);
  if (!output_path) {
    return;
  }
  writeFile(output_path, decoratedSpec);
  info('Wrote spec to', output_path);
}

async function loadSpec(path: string): Promise<string> {
  const raw_spec = await readFile(path);
  info('Loaded spec from', path);
  return raw_spec.toString();
}

async function decorateSpec(raw_spec: string, token: string): Promise<string> {
  info('Decorating spec...');
  const response = await fetch('https:/api.stainlessapi.com/api/spec', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: raw_spec,
  });
  if (!response.ok) {
    const errorMsg = `Failed to decorate spec: ${response.statusText} ${response.text}`;
    error(errorMsg);
    throw Error(errorMsg);
  }
  info('Decorated spec');
  return response.text();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
