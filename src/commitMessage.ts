import { logger } from "./logger";
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
    logger.warn(
      `Commit message "${message}" is not in Conventional Commits format: https://www.conventionalcommits.org/en/v1.0.0/. Prepending "feat:" and using anyway.`,
    );
    return `feat: ${message}`;
  }
  return message;
}

export async function generateAICommitMessage(
  stainless: Stainless,
  params: {
    projectName: string;
    target: string;
    baseRef: string;
    headRef: string;
  },
): Promise<string> {
  const result = (await stainless.post(
    `/v0/projects/${params.projectName}/generate_commit_message`,
    {
      query: {
        target: params.target,
      },
      body: {
        base_ref: params.baseRef,
        head_ref: params.headRef,
      },
    },
  )) as {
    ai_commit_message: string;
  };

  return result.ai_commit_message;
}
