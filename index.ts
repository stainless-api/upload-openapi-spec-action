import { runCmd } from './until';
import { homedir } from 'os';

export async function main() {
  const cwd = process.cwd();
  const customer = cwd.substring(cwd.lastIndexOf('/') + 1).split('-')[0];
  if (customer === undefined) {
    throw new Error('Failed to get customer name');
  }
  await cloneMonorepo();
}

export async function cloneMonorepo() {
  console.log('Cloning monorepo');
  await runCmd('git', ['clone', 'https://github.com/stainless-api/stainless'], {
    cwd: homedir(),
  });
  console.log('Finished cloning monorepo');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
