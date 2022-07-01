import { runCmd } from './util';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { copy, mkdir, rm } from 'fs-extra';
import path from 'path';

export async function main() {
  const cwd = process.cwd();
  const home = homedir();
  // const customer = cwd.substring(cwd.lastIndexOf('/') + 1).split('-')[0];
  const customer = 'lithic';
  const specsFolder = path.join(home, 'specs');
  const distFolder = path.join(home, 'dist');
  if (customer === undefined) {
    throw new Error('Failed to get customer name');
  }

  await moveSpec(customer, cwd, specsFolder);
  await cloneDummyRepos(customer, distFolder);
  await decorateSpec(customer, specsFolder, distFolder);
}

export async function moveSpec(
  customer: string,
  cwd: string,
  specsFolder: string
) {
  const spec = `${customer}-openapi.yml`;
  const config = `${customer}.stainless.yml`;
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
  copy(path.join(cwd, config), path.join(specsFolder, config), (err) => {
    if (err) {
      console.error(
        `Failed to copy ${spec} (stainless config) to ${specsFolder}:`,
        err
      );
    }
  });
}

export async function cloneDummyRepos(customer: string, distFolder: string) {
  if (existsSync(distFolder)) {
    await rm(distFolder, { recursive: true });
  }
  await mkdir(distFolder);
  runCmd(
    'git',
    ['clone', `https://github.com/stainless-sdks/${customer}-node`],
    { cwd: distFolder }
  );
}

export async function decorateSpec(
  customer: string,
  specsFolder: string,
  distFolder: string
) {
  const imageName = 'ghcr.io/stainless-sdks/stainless';
  runCmd('docker', ['pull', imageName]);
  runCmd('docker', [
    'run',
    '-v',
    `${specsFolder}:/specs`,
    '-v',
    `${distFolder}:/dist`,
    imageName,
    'node',
    'stainless.js',
    '--customers',
    customer,
    '--languages',
    'node',
  ]);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
