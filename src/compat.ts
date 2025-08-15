import * as core from "@actions/core";
import * as github from "@actions/github";
import { Comments as GitHubComments } from "@stainless-api/github-internal/resources/repos/issues/comments";
import { createClient as createGitHubClient } from "@stainless-api/github-internal/tree-shakable";

interface Comment {
  id: string | number;
  body: string;
}

interface CommentClient {
  listComments(): Promise<Comment[]>;
  createComment(body: string): Promise<void>;
  updateComment(id: string | number, body: string): Promise<void>;
}

export function isGitLabCI(): boolean {
  return process.env["GITLAB_CI"] === "true";
}

export function getInput(name: string, options?: { required: boolean }) {
  if (isGitLabCI()) {
    const value =
      process.env[`${name.toUpperCase()}`] ||
      process.env[`INPUT_${name.toUpperCase()}`];

    if (options?.required && !value) {
      throw new Error(`Input required and not supplied: ${name}`);
    }

    return value || "";
  } else {
    return core.getInput(name, options);
  }
}

export function getBooleanInput(name: string, options?: { required: boolean }) {
  if (isGitLabCI()) {
    const value =
      process.env[`${name.toUpperCase()}`]?.toLowerCase() ||
      process.env[`INPUT_${name.toUpperCase()}`]?.toLowerCase();

    if (options?.required && value === undefined) {
      throw new Error(`Input required and not supplied: ${name}`);
    }

    return value === "true";
  } else {
    return core.getBooleanInput(name, options);
  }
}

export function getGitHostToken(): string {
  const token = getInput(isGitLabCI() ? "gitlab_token" : "github_token");
  if (getInput("make_comment") && !token) {
    throw new Error(
      `${
        isGitLabCI() ? "GITLAB_TOKEN" : "github_token"
      } is required to make a comment`
    );
  }
  return token;
}

export function getPRNumber(): number {
  if (getInput("make_comment") && isGitLabCI()) {
    if (!process.env["MR_NUMBER"]) {
      throw new Error("MR_NUMBER is required to make a comment");
    }

    return parseInt(process.env["MR_NUMBER"]);
  } else {
    return github.context.payload.pull_request!.number;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setOutput(name: string, value: any) {
  if (isGitLabCI()) {
    // We don't set outputs in GitLab CI.
  } else {
    core.setOutput(name, value);
  }
}

export function isPullRequestOpenedEvent(): boolean {
  if (isGitLabCI()) {
    return process.env["CI_MERGE_REQUEST_EVENT_TYPE"] === "opened";
  } else {
    return github.context.payload.action === "opened";
  }
}

export function startGroup(name: string) {
  if (isGitLabCI()) {
    console.log(`::group::${name}`);
  } else {
    core.startGroup(name);
  }
}

export function endGroup() {
  if (isGitLabCI()) {
    console.log("::endgroup::");
  } else {
    core.endGroup();
  }
}

export function createCommentClient(
  token: string,
  prNumber: number
): CommentClient {
  if (isGitLabCI()) {
    return new GitLabCommentClient(token, prNumber);
  }

  return new GitHubCommentClient(token, prNumber);
}

export function getPRTerm(): string {
  if (isGitLabCI()) {
    return "MR";
  } else {
    return "PR";
  }
}

export function getCITerm(): string {
  if (isGitLabCI()) {
    return "GitLab CI";
  } else {
    return "GitHub Actions";
  }
}

// GitHub comment client implementation
class GitHubCommentClient implements CommentClient {
  private client: any;
  private prNumber: number;

  constructor(token: string, prNumber: number) {
    this.client = createGitHubClient({
      authToken: token,
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      resources: [GitHubComments],
    });
    this.prNumber = prNumber;
  }

  async listComments(): Promise<Comment[]> {
    const { data: comments } = await this.client.repos.issues.comments.list(
      this.prNumber
    );
    return comments.map((c: any) => ({ id: c.id, body: c.body }));
  }

  async createComment(body: string): Promise<void> {
    await this.client.repos.issues.comments.create(this.prNumber, { body });
  }

  async updateComment(id: string | number, body: string): Promise<void> {
    await this.client.repos.issues.comments.update(id, { body });
  }
}

// GitLab comment client implementation
class GitLabCommentClient implements CommentClient {
  private token: string;
  private baseUrl: string;
  private prNumber: number;

  constructor(token: string, prNumber: number) {
    this.token = token;
    this.baseUrl = process.env.CI_API_V4_URL || "https://gitlab.com/api/v4";
    this.prNumber = prNumber;
  }

  private async gitlabRequest(
    method: string,
    endpoint: string,
    body?: unknown
  ) {
    const projectId = process.env.CI_PROJECT_ID!;
    const url = `${this.baseUrl}/projects/${projectId}${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(
        `GitLab API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  async listComments(): Promise<Comment[]> {
    const notes = await this.gitlabRequest(
      "GET",
      `/merge_requests/${this.prNumber}/notes`
    );
    return notes.map((note: any) => ({ id: note.id, body: note.body }));
  }

  async createComment(body: string): Promise<void> {
    await this.gitlabRequest("POST", `/merge_requests/${this.prNumber}/notes`, {
      body,
    });
  }

  async updateComment(id: string | number, body: string): Promise<void> {
    await this.gitlabRequest(
      "PUT",
      `/merge_requests/${this.prNumber}/notes/${id}`,
      {
        body,
      }
    );
  }
}
