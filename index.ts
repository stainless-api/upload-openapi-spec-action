import { runCmd } from './util';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { copy, mkdir, rm } from 'fs-extra';
import path from 'path';
import { getInput } from '@actions/core';

export async function main() {
  const cwd = process.cwd();
  const home = homedir();
  const customer = getInput('customer', { required: true });
  const specsFolder = path.join(home, 'specs');
  const distFolder = path.join(home, 'dist');

  await moveSpec(customer, cwd, specsFolder);
  await initDummyRepo(customer, distFolder);
  await decorateSpec(customer, specsFolder, distFolder);
  await copyUpdatedSpec(customer, specsFolder, cwd);
}

export async function moveSpec(
  customer: string,
  cwd: string,
  specsFolder: string
) {
  console.log('Moving spec');
  const spec = getInput('openapi_path', { required: true });
  const config = getInput('stainless_path', { required: true });
  if (existsSync(specsFolder)) {
    await rm(specsFolder, { recursive: true });
  }
  await mkdir(specsFolder);
  copy(path.join(cwd, spec), path.join(specsFolder, spec), (err) => {
    if (err) {
      console.error(
        `Failed to copy ${spec} (openapi spec) to ${specsFolder}:`,
        err
      );
    }
  });
  copy(path.join(cwd, config), path.join(specsFolder, config));
}

export async function initDummyRepo(customer: string, distFolder: string) {
  console.log('Initiating dummy repo');
  const repoFolder = path.join(distFolder, customer + '-node');
  if (existsSync(distFolder)) {
    await rm(distFolder, { recursive: true });
  }
  await mkdir(repoFolder, { recursive: true });
  await runCmd('git', ['init', '--initial-branch=master'], { cwd: repoFolder });
  await runCmd('yarn', ['init', '--yes', '-s', '.'], {
    cwd: repoFolder,
  });
}

export async function decorateSpec(
  customer: string,
  specsFolder: string,
  distFolder: string
) {
  console.log('Decorating spec');
  const imageName = 'ghcr.io/stainless-sdks/stainless';
  await runCmd('docker', ['pull', imageName]);
  await runCmd('docker', [
    'run',
    '-v',
    `${specsFolder}:/specs`,
    '-v',
    `${distFolder}:/dist`,
    imageName,
    'node',
    'stainless.js',
    '--only-decorate',
    '--customers',
    customer,
    '--languages',
    'node',
  ]);
}

export async function copyUpdatedSpec(
  customer: string,
  specsFolder: string,
  cwd: string
) {
  console.log('Copying updated spec');
  const updatedSpec = `${customer}-openapi.documented.json`;
  await copy(path.join(specsFolder, updatedSpec), path.join(cwd, updatedSpec));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
