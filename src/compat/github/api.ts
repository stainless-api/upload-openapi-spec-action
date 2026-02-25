import { APIError } from "@stainless-api/github-internal/core/error";
import { BaseCommits } from "@stainless-api/github-internal/resources/repos/commits";
import { BaseComments } from "@stainless-api/github-internal/resources/repos/issues/comments";
import { BasePulls } from "@stainless-api/github-internal/resources/repos/pulls";
import {
  createClient,
  type PartialGitHub,
} from "@stainless-api/github-internal/tree-shakable";
import { logger } from "../../logger";
import type { APIClient, Comment, PullRequest } from "../api";
import { getInput } from "../input";
import { getGitHubContext as ctx } from "./context";

class GitHubClient implements APIClient {
  private client: PartialGitHub<{
    repos: {
      commits: BaseCommits;
      issues: { comments: BaseComments };
      pulls: BasePulls;
    };
  }>;

  constructor(token: string) {
    this.client = createClient({
      authToken: token,
      baseURL: ctx().urls.api,
      owner: ctx().owner,
      repo: ctx().repo,
      resources: [BaseCommits, BaseComments, BasePulls],
    });
  }

  async listComments(prNumber: number): Promise<Comment[]> {
    const { data } = await this.client.repos.issues.comments.list(prNumber);
    return data.map((c) => ({ id: c.id, body: c.body ?? "" }));
  }

  async createComment(
    prNumber: number,
    props: Omit<Comment, "id">,
  ): Promise<Comment> {
    const data = await this.client.repos.issues.comments.create(
      prNumber,
      props,
    );
    return { id: data.id, body: data.body! };
  }

  async updateComment(
    _prNumber: number,
    { id, body }: Comment,
  ): Promise<Comment> {
    const data = await this.client.repos.issues.comments.update(id as number, {
      body,
    });
    return { id: data.id, body: data.body! };
  }

  async getPullRequest(number: number): Promise<PullRequest | null> {
    const data = await this.client.repos.pulls.retrieve(number);
    return {
      number,
      state: data.merged_at ? "merged" : (data.state as "open" | "closed"),
      title: data.title,
      base_sha: data.base.sha,
      base_ref: data.base.ref,
      head_ref: data.head.ref,
      head_sha: data.head.sha,
      merge_commit_sha: data.merge_commit_sha,
    };
  }

  async getPullRequestForCommit(sha: string): Promise<PullRequest | null> {
    const pullRequests = await this.client.repos.commits
      .listPullRequests(sha)
      .then(({ data }) =>
        data.filter((c) => c.merged_at || c.state !== "closed"),
      )
      .catch((err) => {
        if (err instanceof APIError && err.status === 404) {
          return [];
        }
        throw err;
      });
    if (pullRequests.length === 0) {
      return null;
    }
    if (pullRequests.length > 1) {
      logger.warn(
        `Multiple pull requests found for commit; only using first.`,
        { commit: sha, pulls: pullRequests.map((c) => c.number) },
      );
    }
    const pull = pullRequests[0]!;
    return {
      number: pull.number,
      state: pull.merged_at ? "merged" : (pull.state as "open" | "closed"),
      title: pull.title,
      base_sha: pull.base.sha,
      base_ref: pull.base.ref,
      head_ref: pull.head.ref,
      head_sha: pull.head.sha,
      merge_commit_sha: pull.merge_commit_sha,
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
