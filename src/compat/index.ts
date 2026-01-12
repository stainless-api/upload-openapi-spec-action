/**
 * Compatibility layer for GitHub Actions and GitLab CI.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { Comments as GitHubComments } from "@stainless-api/github-internal/resources/repos/issues/comments";
import {
  createClient as createGitHubClient,
  type PartialGitHub,
} from "@stainless-api/github-internal/tree-shakable";
import {
  isGitLabCI,
  githubPlatform,
  gitlabPlatform,
  detectPlatform,
  type Platform,
} from "./platform";
import { getInput, getBooleanInput } from "./input";
import { logger } from "../logger";

export {
  isGitLabCI,
  getInput,
  getBooleanInput,
  githubPlatform,
  gitlabPlatform,
  detectPlatform,
  type Platform,
};

interface Comment {
  id: string | number;
  body: string;
}

export interface CommentClient {
  listComments(): Promise<Comment[]>;
  createComment(body: string): Promise<void>;
  updateComment(id: string | number, body: string): Promise<void>;
}

let cachedContext:
  | { payload: Record<string, any>; repo: { owner: string; repo: string } }
  | undefined;

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
  }
  return parseInt(
    getGitHubContext().payload.pull_request?.number ?? process.env["PR_NUMBER"],
  );
}

export function isPullRequestOpenedEvent(): boolean {
  return isGitLabCI()
    ? process.env["CI_MERGE_REQUEST_EVENT_TYPE"] === "opened"
    : getGitHubContext().payload.action === "opened";
}

export function setOutput(name: string, value: any) {
  if (isGitLabCI()) return;

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

export function getPRTerm(): string {
  return isGitLabCI() ? "MR" : "PR";
}

export function getCITerm(): string {
  return isGitLabCI() ? "GitLab CI" : "GitHub Actions";
}

const gitlabBaseUrl = () => process.env.GITLAB_BASE_URL ?? "https://gitlab.com";

export function getRepoPath(owner: string, repo: string): string {
  return process.env.GITLAB_STAGING_REPO_PATH
    ? `${gitlabBaseUrl()}/${process.env.GITLAB_STAGING_REPO_PATH}`
    : `https://github.com/${owner}/${repo}`;
}

export function getGitHostToken() {
  const inputName = isGitLabCI() ? "GITLAB_TOKEN" : "github_token";
  const token = getInput(inputName);
  const isRequired = getBooleanInput("make_comment", { required: true });
  if (isRequired && !token) {
    throw new Error(`Input ${inputName} is required to make a comment`);
  }
  return token;
}

export function getRunUrl() {
  return isGitLabCI()
    ? `${process.env.CI_PROJECT_URL}/-/pipelines/${process.env.CI_PIPELINE_ID}`
    : `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
}

export async function getStainlessAuthToken(): Promise<string> {
  const apiKey = getInput("stainless_api_key", { required: isGitLabCI() });
  if (apiKey) {
    logger.debug("Authenticating with provided Stainless API key");
    return apiKey;
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
    return data.value;
  } catch (error) {
    throw new Error(
      `Failed to authenticate with GitHub OIDC. Make sure your workflow has 'id-token: write' permission ` +
        `and that you have the Stainless GitHub App installed: https://www.stainless.com/docs/guides/publish/#install-the-stainless-github-app. ` +
        `Error: ${error}`,
    );
  }
}

export function createCommentClient(
  token: string,
  prNumber: number,
): CommentClient {
  return isGitLabCI()
    ? new GitLabCommentClient(token, prNumber)
    : new GitHubCommentClient(token, prNumber);
}

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
}

class GitLabCommentClient implements CommentClient {
  private token: string;
  private baseUrl: string;
  private prNumber: number;

  constructor(token: string, prNumber: number) {
    this.token = token;
    this.baseUrl = `${gitlabBaseUrl()}/api/v4`;
    this.prNumber = prNumber;
  }

  private async request(method: string, endpoint: string, body?: unknown) {
    const url = `${this.baseUrl}/projects/${process.env.CI_PROJECT_ID}${endpoint}`;
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
}
