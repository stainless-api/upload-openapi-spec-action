import { getInput } from '@actions/core';
import { error, info } from 'console';
import { readFile, writeFile } from 'fs-extra';
import fetch from 'node-fetch';

export async function main() {
  // inputs
  const token = getInput('api_token', { required: true });
  const raw_spec_path = getInput('openapi_path', { required: true });
  const customer = getInput('customer', { required: true });

  const raw_spec = await loadSpec(raw_spec_path);
  const decoratedSpec = await decorateSpec(raw_spec, token);
  const filename = `${customer}-openapi.documented.json`;
  writeFile(filename, decoratedSpec);
  info('Wrote spec to', filename);
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
    error('Failed to decorate spec:', response.statusText, response.text);
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
