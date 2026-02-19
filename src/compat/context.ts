import { getGitHubContext, type GitHubContext } from "./github/context";
import { getGitLabContext, type GitLabContext } from "./gitlab/context";
import { getProvider } from "./provider";

export type BaseContext = {
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
