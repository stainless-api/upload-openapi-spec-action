/**
 * Compatibility layer for GitHub Actions and GitLab CI.
 */

import { Commits as GitHubCommits } from "@stainless-api/github-internal/resources/repos/commits";
import { Comments as GitHubComments } from "@stainless-api/github-internal/resources/repos/issues/comments";
import {
  createClient as createGitHubClient,
  type PartialGitHub,
} from "@stainless-api/github-internal/tree-shakable";
import { logger } from "../logger";
import { ctx } from "./context";
import { getBooleanInput, getInput } from "./input";
import { getProvider } from "./provider";

export { ctx } from "./context";
export { getBooleanInput, getInput } from "./input";
export { logging } from "./logging";
export { setOutput } from "./output";
export { getProvider } from "./provider";

interface Comment {
  id: string | number;
  body: string;
}

interface PullRequest {
  number: number;
  state: "open" | "closed" | "merged";
  base_sha: string;
  base_ref: string;
  head_sha: string;
  head_ref: string;
}

export interface VCSClient {
  listComments(): Promise<Comment[]>;
  createComment(body: string): Promise<void>;
  updateComment(id: string | number, body: string): Promise<void>;

  getPullRequestForCommit(sha: string): Promise<PullRequest | null>;
}

export function getGitHostToken() {
  const inputName =
    getProvider() === "gitlab" ? "GITLAB_TOKEN" : "github_token";
  const token = getInput(inputName);
  const isRequired = getBooleanInput("make_comment", { required: true });
  if (isRequired && !token) {
    throw new Error(`Input ${inputName} is required to make a comment`);
  }
  if (getProvider() === "gitlab" && token?.startsWith("$")) {
    throw new Error(
      `Input ${inputName} starts with '$'; expected token to start with 'gl'. Does the CI have access to the variable?`,
    );
  }
  return token;
}

export async function getStainlessAuth(): Promise<{
  key: string;
  expiresAt: number | null;
}> {
  const apiKey = getInput("stainless_api_key", {
    required: getProvider() === "gitlab",
  });
  if (apiKey) {
    logger.debug("Authenticating with provided Stainless API key");
    return {
      key: apiKey,
      expiresAt: null,
    };
  }

  logger.debug("Authenticating with GitHub OIDC");
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;

  if (!requestUrl || !requestToken) {
    throw new Error(
      `Failed to authenticate with GitHub OIDC. Make sure your workflow has 'id-token: write' permission ` +
        `and that you have the Stainless GitHub App installed: https://www.stainless.com/docs/guides/publish/#install-the-stainless-github-app`,
    );
  }

  try {
    const response = await fetch(`${requestUrl}&audience=api.stainless.com`, {
      headers: { Authorization: `Bearer ${requestToken}` },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    if (!data.value) {
      throw new Error("No token in OIDC response");
    }
    return {
      key: data.value,
      expiresAt: Date.now() + 300 * 1000,
    };
  } catch (error) {
    throw new Error(
      `Failed to authenticate with GitHub OIDC. Make sure your workflow has 'id-token: write' permission ` +
        `and that you have the Stainless GitHub App installed: https://www.stainless.com/docs/guides/publish/#install-the-stainless-github-app. ` +
        `Error: ${error}`,
    );
  }
}

export function createVCSClient(token: string, prNumber: number): VCSClient {
  return getProvider() === "gitlab"
    ? new GitLabClient(token, prNumber)
    : new GitHubClient(token, prNumber);
}

class GitHubClient implements VCSClient {
  private client: PartialGitHub<{
    repos: {
      commits: GitHubCommits;
      issues: { comments: GitHubComments };
    };
  }>;
  private prNumber: number;

  constructor(token: string, prNumber: number) {
    this.client = createGitHubClient({
      authToken: token,
      baseURL: ctx().urls.api,
      owner: ctx().owner,
      repo: ctx().repo,
      resources: [GitHubComments, GitHubCommits],
    });
    this.prNumber = prNumber;
  }

  async listComments(): Promise<Comment[]> {
    const { data } = await this.client.repos.issues.comments.list(
      this.prNumber,
    );
    return data.map((c) => ({ id: c.id, body: c.body ?? "" }));
  }

  async createComment(body: string): Promise<void> {
    await this.client.repos.issues.comments.create(this.prNumber, { body });
  }

  async updateComment(id: number, body: string): Promise<void> {
    await this.client.repos.issues.comments.update(id, { body });
  }

  async getPullRequestForCommit(sha: string): Promise<PullRequest | null> {
    const { data } = await this.client.repos.commits.listPullRequests(sha);
    if (data.length === 0) {
      return null;
    }
    if (data.length > 1) {
      logger.warn(
        `Multiple pull requests found for commit; only using first.`,
        { commit: sha, pulls: data.map((c) => c.number) },
      );
    }
    const pull = data[0]!;
    return {
      number: pull.number,
      state: pull.merged_at ? "merged" : (pull.state as "open" | "closed"),
      base_sha: pull.base.sha,
      base_ref: pull.base.ref,
      head_ref: pull.head.ref,
      head_sha: pull.head.sha,
    };
  }
}

class GitLabClient implements VCSClient {
  private token: string;
  private baseUrl: string;
  private prNumber: number;

  constructor(token: string, prNumber: number) {
    this.token = token;
    this.baseUrl = `${ctx().urls.api}/v4`;
    this.prNumber = prNumber;
  }

  private requestId = 0;
  private async request(method: string, endpoint: string, body?: unknown) {
    const id = this.requestId++;
    const url = `${this.baseUrl}/projects/${process.env.CI_PROJECT_ID}${endpoint}`;
    logger.debug(`[${id}] sending request`, {
      body: body ? JSON.stringify(body) : undefined,
      method,
      url,
    });
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      logger.debug(`[${id}] request failed`, {
        status: response.status,
        statusText: response.statusText,
        body: await response.text().catch(() => "[failed to read body]"),
      });
      throw new Error(
        `GitLab API error: ${response.status} ${response.statusText}`,
      );
    }
    return response.json();
  }

  async listComments(): Promise<Comment[]> {
    const notes = await this.request(
      "GET",
      `/merge_requests/${this.prNumber}/notes`,
    );
    return (notes as { id: string; body: string }[]).map((n) => ({
      id: n.id,
      body: n.body,
    }));
  }

  async createComment(body: string): Promise<void> {
    await this.request("POST", `/merge_requests/${this.prNumber}/notes`, {
      body,
    });
  }

  async updateComment(id: number, body: string): Promise<void> {
    await this.request("PUT", `/merge_requests/${this.prNumber}/notes/${id}`, {
      body,
    });
  }

  async getPullRequestForCommit(sha: string): Promise<PullRequest | null> {
    const mergeRequests = (await this.request(
      "GET",
      `/repository/commits/${sha}/merge_requests`,
    )) as { iid: number }[];
    if (mergeRequests.length === 0) {
      return null;
    }
    if (mergeRequests.length > 1) {
      logger.warn(
        `Multiple merge requests found for commit; only using first.`,
        { commit: sha, mergeRequests: mergeRequests.map((c) => c.iid) },
      );
    }

    const mergeRequestIID = mergeRequests[0]!.iid;
    let attempts = 0;
    let mergeRequest: {
      iid: number;
      state: "opened" | "closed" | "merged" | "locked";
      /**
       * Per GitLab docs:
       * > Empty when the merge request is created, and populates asynchronously.
       * So we poll until it's populated.
       */
      diff_refs: {
        /**
         * GitLab docs say:
         * > SHA of the target branch commit. The starting point for the diff.
         * > Usually the same as base_sha.
         * So this is what corresponds with our `base_sha`; their `base_sha`
         * is what we call the merge base SHA.
         */
        start_sha: string;
        head_sha: string;
      } | null;
      source_branch: string;
      target_branch: string;
    } | null = null;

    while (attempts < 3) {
      attempts++;
      mergeRequest = await this.request(
        "GET",
        `/merge_requests/${mergeRequestIID}`,
      );

      if (mergeRequest?.diff_refs) {
        return {
          number: mergeRequest.iid,
          state:
            mergeRequest.state === "opened"
              ? "open"
              : mergeRequest.state === "locked"
                ? "closed"
                : mergeRequest.state,
          base_sha: mergeRequest.diff_refs.start_sha,
          base_ref: mergeRequest.target_branch,
          head_sha: mergeRequest.diff_refs.head_sha,
          head_ref: mergeRequest.source_branch,
        };
      }

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 1000 * (2 ** attempts + Math.random()));
      });
    }

    logger.warn(
      `Failed to find merge request for commit after ${attempts} attempts`,
      { commit: sha, mergeRequestIID },
    );

    return null;
  }
}
