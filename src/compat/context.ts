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
    /** Name of the provider, e.g. `GitHub`. */
    provider: string;
  };

  /** Default branch for the repository. */
  defaultBranch: string | null;
  /**
   * Associated PR number for this action run, if any.
   *
   * Note that if the PR is inferred (like in the case of the build->preview
   * dispatch), this will be null.
   */
  prNumber: number | null;
  /** Associated ref name (usually a branch) for this action run, if any. */
  refName: string | null;
  /**
   * Associated SHA for this action run, if any.
   *
   * Be careful with this: it's not always the SHA of the commit that's
   * currently checked out, nor is it the base SHA or the head SHA of a PR.
   */
  sha: string | null;
};

export type Context = GitHubContext | GitLabContext;

export function ctx(): Context {
  switch (getProvider()) {
    case "github": {
      return getGitHubContext();
    }
    case "gitlab": {
      return getGitLabContext();
    }
  }
}
