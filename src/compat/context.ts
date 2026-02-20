import * as fs from "node:fs";
import { getProvider } from "./provider";

type BaseContext = {
  /**
   * Internal name of CI platform, e.g. `github`.
   *
   * This is meant for type discrimination for the rest of the context. If you
   * only need the provider, use `getProvider()` instead, to avoid loading the
   * rest of the context.
   */
  provider: string;

  /** Full URL of the host, e.g. `https://github.com`. */
  host: string;
  /** Owner or namespace of the repository, e.g. `octocat`. */
  owner: string;
  /** Name of the repository, e.g. `hello-world`. */
  repo: string;

  /** Platform-specific URLs. */
  urls: {
    /** API base URL, e.g. `https://api.github.com`. */
    api: string;
    /** URL to the CI run, e.g. `https://github.com/octocat/hello-world/actions/runs/1`. */
    run: string;
  };

  /** Platform-specific display names. */
  names: {
    /** Name of the CI platform, e.g. `GitHub Actions`. */
    ci: string;
    /** Abbreviation for pull-request-equivalent, e.g. `PR`. */
    pr: string;
  };

  /** Associated PR number for this action run, if any. */
  prNumber: number | null;
};

type GitHubContext = BaseContext & {
  provider: "github";
};

function getGitHubContext(): GitHubContext {
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

  let prNumber: number | null = null;

  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const payload =
      eventPath &&
      fs.existsSync(eventPath) &&
      JSON.parse(fs.readFileSync(eventPath, "utf-8"));
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

  return {
    provider: "github",
    host,
    owner,
    repo,
    urls: { api: apiURL, run: runURL },
    names: { ci: "GitHub Actions", pr: "PR" },
    prNumber,
  };
}

type GitLabContext = BaseContext & {
  provider: "gitlab";
  projectID: string;
};

function getGitLabContext(): GitLabContext {
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
  const apiV4URL = process.env.CI_API_V4_URL || `${host}/api/v4`;
  const apiURL = apiV4URL.replace(/\/v4\/?$/, "");
  const maybePRNumber = parseInt(
    process.env.CI_MERGE_REQUEST_IID || process.env.MR_NUMBER || "",
    10,
  );
  const prNumber = Number.isInteger(maybePRNumber) ? maybePRNumber : null;

  return {
    provider: "gitlab",
    host,
    owner,
    repo,
    urls: { api: apiURL, run: runURL },
    names: { ci: "GitLab CI", pr: "MR" },
    prNumber,
    projectID,
  };
}

export type Context = GitHubContext | GitLabContext;

let cachedContext: Context | undefined;

export function ctx(): Context {
  if (cachedContext) {
    return cachedContext;
  }
  switch (getProvider()) {
    case "github": {
      cachedContext = getGitHubContext();
      break;
    }
    case "gitlab": {
      cachedContext = getGitLabContext();
      break;
    }
  }
  return cachedContext;
}
