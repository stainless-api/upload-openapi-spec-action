import { BaseCommits as GitHubCommits } from "@stainless-api/github-internal/resources/repos/commits";
import { BaseComments as GitHubComments } from "@stainless-api/github-internal/resources/repos/issues/comments";
import {
  createClient as createGitHubClient,
  type PartialGitHub,
} from "@stainless-api/github-internal/tree-shakable";
import { logger } from "../../logger";
import type { APIClient, Comment, PullRequest } from "../api";
import { getInput } from "../input";
import { getGitHubContext as ctx } from "./context";

class GitHubClient implements APIClient {
  private client: PartialGitHub<{
    repos: {
      commits: GitHubCommits;
      issues: { comments: GitHubComments };
    };
  }>;

  constructor(token: string) {
    this.client = createGitHubClient({
      authToken: token,
      baseURL: ctx().urls.api,
      owner: ctx().owner,
      repo: ctx().repo,
      resources: [GitHubComments, GitHubCommits],
    });
  }

  async listComments(): Promise<Comment[]> {
    const { data } = await this.client.repos.issues.comments.list(
      ctx().prNumber!,
    );
    return data.map((c) => ({ id: c.id, body: c.body ?? "" }));
  }

  async createComment(body: string): Promise<void> {
    await this.client.repos.issues.comments.create(ctx().prNumber!, { body });
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

let cachedClient: GitHubClient | null | undefined;

export function getGitHubClient(): GitHubClient | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const token = getInput("github_token");
  if (token) {
    cachedClient = new GitHubClient(token);
  } else {
    logger.info("No GitHub token found via input 'github_token'.");
    cachedClient = null;
  }

  return cachedClient;
}
