import Stainless from "@stainless-api/sdk";

// https://www.conventionalcommits.org/en/v1.0.0/
const CONVENTIONAL_COMMIT_REGEX = new RegExp(
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\(.*\))?(!?): .*$/m,
);

export function makeCommitMessageConventional(message: string): string;
export function makeCommitMessageConventional(
  message?: string,
): string | undefined;
export function makeCommitMessageConventional(message?: string) {
  if (message && !CONVENTIONAL_COMMIT_REGEX.test(message)) {
    console.warn(
      `Commit message: "${message}" is not in Conventional Commits format: https://www.conventionalcommits.org/en/v1.0.0/. Prepending "feat" and using anyway.`,
    );
    return `feat: ${message}`;
  }
  return message;
}

export async function generateAiCommitMessage(
  stainless: Stainless,
  params: { target: string; baseRef: string; headRef: string },
): Promise<string | null> {
  console.log(`Generating AI commit message between ${params.baseRef} and ${params.headRef}`);
  return "feat: Some AI commit message";
}
