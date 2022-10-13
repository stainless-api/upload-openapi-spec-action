import { getInput } from '@actions/core';
import { readFile } from 'fs-extra';

export async function main() {
  const raw_spec = await loadSpec();
}

async function loadSpec(): Promise<string> {
  const raw_spec_path = getInput('openapi_path', { required: true });
  const raw_spec = await readFile(raw_spec_path);
  console.log('Loaded spec from', raw_spec_path);
  return raw_spec.toString();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
