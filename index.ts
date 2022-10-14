import { getInput } from '@actions/core';
import { readFile, writeFile } from 'fs-extra';
import fetch from 'node-fetch';

export async function main() {
  // actions inputs
  const token = getInput('api_token', { required: true });
  const raw_spec_path = getInput('openapi_path', { required: true });
  const customer = getInput('customer', { required: true });

  const raw_spec = await loadSpec(raw_spec_path);
  const decoratedSpec = await decorateSpec(raw_spec, token);
  const filename = `${customer}-openapi.documented.json`;
  writeFile(filename, decoratedSpec);
  console.log('Wrote spec to', filename);
}

async function loadSpec(path: string): Promise<string> {
  const raw_spec = await readFile(path);
  console.log('Loaded spec from', path);
  return raw_spec.toString();
}

async function decorateSpec(raw_spec: string, token: string): Promise<string> {
  console.log('Decorating spec...');
  const response = await fetch('https:/api.stainlessapi.com/api/spec', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: raw_spec,
  });
  if (!response.ok) {
    console.log('Failed to decorate spec:', response.statusText, response.text);
  }
  console.log('Decorated spec');
  return response.text.toString();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
