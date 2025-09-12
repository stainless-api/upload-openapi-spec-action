import { logger } from "./logger";

// https://www.conventionalcommits.org/en/v1.0.0/
const CONVENTIONAL_COMMIT_REGEX = new RegExp(
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\(.*\))?(!?): .*$/,
);

export function makeCommitMessageConventional(message: string): string;
export function makeCommitMessageConventional(
  message?: string,
): string | undefined;
export function makeCommitMessageConventional(message?: string) {
  if (message && !CONVENTIONAL_COMMIT_REGEX.test(message)) {
    logger.warn(
      `Commit message: "${message}" is not in Conventional Commits format: https://www.conventionalcommits.org/en/v1.0.0/. Prepending "feat" and using anyway.`,
    );
    return `feat: ${message}`;
  }
  return message;
}
