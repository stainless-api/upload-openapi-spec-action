import { logger } from "../../logger";
import type { BaseContext } from "../context";

export type GitLabContext = BaseContext & {
  provider: "gitlab";
  projectID: string;
};

let cachedContext: GitLabContext | undefined;

export function getGitLabContext(): GitLabContext {
  if (cachedContext) {
    return cachedContext;
  }

  const owner = process.env.CI_PROJECT_NAMESPACE;
  const repo = process.env.CI_PROJECT_NAME;
  const runURL = process.env.CI_JOB_URL;
  const projectID = process.env.CI_PROJECT_ID;

  if (!owner || !repo || !runURL || !projectID) {
    throw new Error(
      "Expected env vars CI_PROJECT_NAMESPACE, CI_PROJECT_NAME, CI_JOB_URL, and CI_PROJECT_ID to be set.",
    );
  }

  const host = process.env.CI_SERVER_URL || "https://gitlab.com";
  const apiURL = process.env.CI_API_V4_URL || `${host}/api/v4`;
  const maybePRNumber = parseInt(
    process.env.CI_MERGE_REQUEST_IID || process.env.MR_NUMBER || "",
    10,
  );
  const prNumber = Number.isInteger(maybePRNumber) ? maybePRNumber : null;

  cachedContext = {
    provider: "gitlab",
    host,
    owner,
    repo,
    urls: { api: apiURL, run: runURL },
    names: { ci: "GitLab CI", pr: "MR" },
    prNumber,
    projectID,
  };

  logger.debug("GitLab context", cachedContext);
  return cachedContext;
}
