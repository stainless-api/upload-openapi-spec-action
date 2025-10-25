/* eslint-disable @typescript-eslint/no-explicit-any */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { Comments as GitHubComments } from "@stainless-api/github-internal/resources/repos/issues/comments";
import {
  createClient as createGitHubClient,
  type PartialGitHub,
} from "@stainless-api/github-internal/tree-shakable";

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

export function getInput<const T extends readonly string[]>(
  name: string,
  options: { choices: T; required: true },
): T[number];
export function getInput<const T extends readonly string[]>(
  name: string,
  options: { choices: T; required?: boolean },
): T[number] | undefined;
export function getInput(
  name: string,
  options: { choices?: readonly string[]; required: true },
): string;
export function getInput(
  name: string,
  options?: { choices?: readonly string[]; required?: boolean },
): string | undefined;
export function getInput(
  name: string,
  options?: { choices?: readonly string[]; required?: boolean },
) {
  const value =
    process.env[`${name.toUpperCase()}`] ||
    process.env[`INPUT_${name.toUpperCase()}`];

  if (options?.required && !value) {
    throw new Error(`Input required and not supplied: ${name}`);
  }

  if (options?.choices && value && !options.choices.includes(value)) {
    throw new Error(
      `Input not one of the allowed choices for ${name}: ${value}`,
    );
  }

  return value || undefined;
}

export function getBooleanInput(
  name: string,
  options: { required: true },
): boolean;
export function getBooleanInput(
  name: string,
  options?: { required: boolean },
): boolean | undefined;
export function getBooleanInput(name: string, options?: { required: boolean }) {
  const value = getInput(name, options)?.toLowerCase();

  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function getGitHostToken() {
  const input_name = isGitLabCI() ? "GITLAB_TOKEN" : "github_token";
  const token = getInput(input_name);

  const isRequired = getBooleanInput("make_comment", { required: true });
  if (isRequired && !token) {
    throw new Error(`Input ${input_name} is required to make a comment`);
  }

  return token;
}

export async function getStainlessAuthToken(): Promise<string> {
  const apiKey = getInput("stainless_api_key", { required: isGitLabCI() });

  if (apiKey) {
    console.log("Authenticating with provided Stainless API key");
    return apiKey;
  }

  // Fall back to GitHub OIDC authentication
  console.log("Authenticating with GitHub OIDC");

  try {
    // Dynamically import @actions/core to get OIDC token
    const core = await import("@actions/core");
    const token = await core.getIDToken("api.stainless.com");

    if (!token) {
      throw new Error("Failed to get OIDC token from GitHub");
    }

    return token;
  } catch (error) {
    throw new Error(
      `Failed to authenticate with GitHub OIDC. Make sure your workflow has 'id-token: write' permission. ` +
        `Alternatively, you can provide a stainless_api_key input. Error: ${error}`,
    );
  }
}

let cachedContext:
  | {
      payload: Record<string, any>;
      repo: { owner: string; repo: string };
    }
  | undefined = undefined;
function getGitHubContext() {
  if (!cachedContext) {
    const eventPath = process.env.GITHUB_EVENT_PATH;

    let payload: Record<string, any> = {};
    if (eventPath && fs.existsSync(eventPath)) {
      payload = JSON.parse(fs.readFileSync(eventPath, "utf-8"));
    }

    const [owner, repo] = process.env.GITHUB_REPOSITORY?.split("/") ?? [];

    cachedContext = {
      payload,
      repo: {
        owner: payload.repository?.owner?.login ?? owner,
        repo: payload.repository?.name ?? repo,
      },
    };
  }
  return cachedContext!;
}

export function getPRNumber() {
  if (getInput("make_comment") && isGitLabCI()) {
    if (!process.env["MR_NUMBER"]) {
      throw new Error("MR_NUMBER is required to make a comment");
    }

    return parseInt(process.env["MR_NUMBER"]);
  } else {
    return parseInt(getGitHubContext().payload.pull_request!.number);
  }
}

export function setOutput(name: string, value: any) {
  if (isGitLabCI()) {
    // We don't set outputs in GitLab CI.
    return;
  }

  const stringified =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);

  const filePath = process.env["GITHUB_OUTPUT"];
  if (filePath && fs.existsSync(filePath)) {
    const delimiter = `ghadelimiter_${crypto.randomUUID()}`;
    fs.appendFileSync(
      filePath,
      `${name}<<${delimiter}\n${stringified}\n${delimiter}\n`,
      "utf-8",
    );
  } else {
    process.stdout.write(`\n::set-output name=${name}::${stringified}\n`);
  }
}

export function isPullRequestOpenedEvent(): boolean {
  if (isGitLabCI()) {
    return process.env["CI_MERGE_REQUEST_EVENT_TYPE"] === "opened";
  } else {
    return getGitHubContext().payload.action === "opened";
  }
}

export function startGroup(id: string, name: string) {
  if (isGitLabCI()) {
    console.log(`\x1b[0Ksection_start:${Date.now()}:${id}\r\x1b[0K${name}`);
  } else {
    process.stdout.write(`\n::group::${name}\n`);
  }
}

export function endGroup(id: string) {
  if (isGitLabCI()) {
    console.log(`\x1b[0Ksection_end:${Date.now()}:${id}\r\x1b[0K`);
  } else {
    process.stdout.write(`\n::endgroup::\n`);
  }
}

export function createCommentClient(
  token: string,
  prNumber: number,
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

export function getRepoPath(owner: string, repo: string): string {
  return process.env.GITLAB_STAGING_REPO_PATH
    ? `${gitlabBaseUrl()}/${process.env.GITLAB_STAGING_REPO_PATH}`
    : `https://github.com/${owner}/${repo}`;
}

const gitlabBaseUrl = () => process.env.GITLAB_BASE_URL ?? "https://gitlab.com";

// GitHub comment client implementation
class GitHubCommentClient implements CommentClient {
  private client: PartialGitHub<{
    repos: { issues: { comments: GitHubComments } };
  }>;
  private prNumber: number;

  constructor(token: string, prNumber: number) {
    this.client = createGitHubClient({
      authToken: token,
      owner: getGitHubContext().repo.owner,
      repo: getGitHubContext().repo.repo,
      resources: [GitHubComments],
    });
    this.prNumber = prNumber;
  }

  async listComments(): Promise<Comment[]> {
    const { data: comments } = await this.client.repos.issues.comments.list(
      this.prNumber,
    );
    return comments.map((c) => ({
      id: c.id,
      body: c.body ?? "",
    }));
  }

  async createComment(body: string): Promise<void> {
    await this.client.repos.issues.comments.create(this.prNumber, { body });
  }

  async updateComment(id: number, body: string): Promise<void> {
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
    this.baseUrl = `${gitlabBaseUrl()}/api/v4`;
    this.prNumber = prNumber;
  }

  private async gitlabRequest(
    method: string,
    endpoint: string,
    body?: unknown,
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
        `GitLab API error: ${response.status} ${response.statusText}`,
      );
    }

    return response.json();
  }

  async listComments(): Promise<Comment[]> {
    const notes = await this.gitlabRequest(
      "GET",
      `/merge_requests/${this.prNumber}/notes`,
    );
    return (notes as { id: string; body: string }[]).map((note) => ({
      id: note.id,
      body: note.body,
    }));
  }

  async createComment(body: string): Promise<void> {
    await this.gitlabRequest("POST", `/merge_requests/${this.prNumber}/notes`, {
      body,
    });
  }

  async updateComment(id: number, body: string): Promise<void> {
    await this.gitlabRequest(
      "PUT",
      `/merge_requests/${this.prNumber}/notes/${id}`,
      {
        body,
      },
    );
  }
}
