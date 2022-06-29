import { runCmd } from './until';
import { homedir } from 'os';
import { existsSync, rename } from 'fs';
import { copy, remove } from 'fs-extra';
import path from 'path';

export async function main() {
  const cwd = process.cwd();
  const home = homedir();
  const customer = cwd.substring(cwd.lastIndexOf('/') + 1).split('-')[0];
  if (customer === undefined) {
    throw new Error('Failed to get customer name');
  }
  await cloneMonorepo(home);
  await moveSpec(customer, cwd, home);
}

export async function cloneMonorepo(home: string) {
  console.log('Cloning monorepo');
  const location = path.join(home, 'stainless');
  if (existsSync(location)) {
    await remove(location);
  }
  await runCmd('git', ['clone', 'https://github.com/stainless-api/stainless'], {
    cwd: home,
  });
  console.log('Finished cloning monorepo');
}

export async function moveSpec(customer: string, cwd: string, home: string) {
  copy(
    path.join(cwd, `${customer}-openapi.json`),
    path.join(home, 'stainless', 'specs', `${customer}-openapi.json`),
    (err) => {
      if (err) {
        console.error('Failed to move openapi spec to monorepo:', err);
      }
    }
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
