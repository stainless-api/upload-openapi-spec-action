import { logger } from "../../logger";
import type { APIClient, Comment, PullRequest } from "../api";
import { getInput } from "../input";
import { getGitLabContext as ctx } from "./context";

class GitLabClient implements APIClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private requestId = 0;
  private async request(method: string, endpoint: string, body?: unknown) {
    const id = this.requestId++;
    const url = `${ctx().urls.api}/v4/projects/${ctx().projectID}${endpoint}`;
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
      `/merge_requests/${ctx().prNumber}/notes`,
    );
    return (notes as { id: string; body: string }[]).map((n) => ({
      id: n.id,
      body: n.body,
    }));
  }

  async createComment(body: string): Promise<void> {
    await this.request("POST", `/merge_requests/${ctx().prNumber}/notes`, {
      body,
    });
  }

  async updateComment(id: number, body: string): Promise<void> {
    await this.request("PUT", `/merge_requests/${ctx().prNumber}/notes/${id}`, {
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

let cachedClient: GitLabClient | null | undefined;

export function getGitLabClient(): GitLabClient | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const token = getInput("GITLAB_TOKEN");

  if (token?.startsWith("$")) {
    throw new Error(
      `Input GITLAB_TOKEN starts with '$'; expected token to start with 'gl'. Does the CI have access to the variable?`,
    );
  }

  if (token) {
    cachedClient = new GitLabClient(token);
  } else {
    logger.info("No GitLab token found in input 'GITLAB_TOKEN'.");
    cachedClient = null;
  }

  return cachedClient;
}
