import { getGitHubClient } from "./github/api";
import { getGitLabClient } from "./gitlab/api";
import { getProvider } from "./provider";

export interface Comment {
  id: string | number;
  body: string;
}

export interface PullRequest {
  number: number;
  state: "open" | "closed" | "merged";
  title: string;
  base_sha: string;
  base_ref: string;
  head_sha: string;
  head_ref: string;
}

export interface APIClient {
  listComments(prNumber: number): Promise<Comment[]>;
  createComment(prNumber: number, props: Omit<Comment, "id">): Promise<Comment>;
  updateComment(prNumber: number, props: Comment): Promise<Comment>;

  getPullRequest(number: number): Promise<PullRequest | null>;

  getPullRequestForCommit(sha: string): Promise<PullRequest | null>;
}

export function api(options: { optional: true }): APIClient | null;
export function api(options?: { optional?: boolean }): APIClient;
export function api(options?: { optional?: boolean }): APIClient | null {
  let client;
  switch (getProvider()) {
    case "github": {
      client = getGitHubClient();
      break;
    }
    case "gitlab": {
      client = getGitLabClient();
      break;
    }
  }
  if (!client) {
    if (options?.optional) {
      return null;
    } else {
      throw new Error("Failed to get API client.");
    }
  }
  return client;
}
