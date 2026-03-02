import * as fs from "node:fs";
import type { BaseContext } from "../context";
import { logger } from "../../logger";

export type GitHubContext = BaseContext & {
  provider: "github";
};

let cachedContext: GitHubContext | undefined;

export function getGitHubContext(): GitHubContext {
  if (cachedContext) {
    return cachedContext;
  }

  const [owner, repo] = process.env.GITHUB_REPOSITORY?.split("/") ?? [];
  const runID = process.env.GITHUB_RUN_ID;

  if (!owner || !repo || !runID) {
    throw new Error(
      "Expected env vars GITHUB_REPOSITORY and GITHUB_RUN_ID to be set.",
    );
  }

  const host = process.env.GITHUB_SERVER_URL || "https://github.com";
  const apiURL = process.env.GITHUB_API_URL || "https://api.github.com";
  const runURL = `${host}/${owner}/${repo}/actions/runs/${runID}`;

  let defaultBranch: string | null = null;
  let prNumber: number | null = null;

  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const payload =
      eventPath &&
      fs.existsSync(eventPath) &&
      JSON.parse(fs.readFileSync(eventPath, "utf-8"));
    const maybeDefaultBranch = payload?.repository?.default_branch;
    if (typeof maybeDefaultBranch === "string") {
      defaultBranch = maybeDefaultBranch;
    }
    const maybePRNumber = parseInt(
      payload?.pull_request?.number ?? process.env.PR_NUMBER ?? "",
      10,
    );
    if (Number.isInteger(maybePRNumber)) {
      prNumber = maybePRNumber;
    }
  } catch (e) {
    throw new Error(`Failed to parse GitHub event: ${e}`);
  }

  const refName = process.env.GITHUB_REF_NAME || null;
  const sha = process.env.GITHUB_SHA || null;

  cachedContext = {
    provider: "github",
    host,
    owner,
    repo,
    urls: { api: apiURL, run: runURL },
    names: { ci: "GitHub Actions", pr: "PR", provider: "GitHub" },
    defaultBranch,
    prNumber,
    refName,
    sha,
  };

  logger.debug("GitHub context", cachedContext);
  return cachedContext;
}
