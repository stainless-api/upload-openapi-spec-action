import { APIError } from "@stainless-api/gitlab-internal/core/error";
import type { APIEntitiesNote } from "@stainless-api/gitlab-internal/resources/projects/issues/notes/notes";
import {
  APIEntitiesMergeRequest,
  BaseMergeRequests as GitLabMergeRequests,
} from "@stainless-api/gitlab-internal/resources/projects/merge-requests/merge-requests";
import { BaseNotes as GitLabNotes } from "@stainless-api/gitlab-internal/resources/projects/merge-requests/notes";
import { BaseCommits as GitLabCommits } from "@stainless-api/gitlab-internal/resources/projects/repository/commits";
import {
  createClient as createGitLabClient,
  PartialGitLab,
} from "@stainless-api/gitlab-internal/tree-shakable";

import { logger } from "../../logger";
import type { APIClient, Comment, PullRequest } from "../api";
import { getInput } from "../input";
import { getGitLabContext as ctx } from "./context";

class GitLabClient implements APIClient {
  private client: PartialGitLab<{
    projects: {
      repository: { commits: GitLabCommits };
      mergeRequests: GitLabMergeRequests & { notes: GitLabNotes };
    };
  }>;

  constructor(token: string) {
    this.client = createGitLabClient({
      apiToken: token,
      baseURL: ctx().urls.api,
      resources: [GitLabCommits, GitLabMergeRequests, GitLabNotes],
    });
  }

  async listComments(): Promise<Comment[]> {
    // The OAS claims it's a single object, but the docs claim it's an array.
    // Just handle both.
    const comments: APIEntitiesNote[] =
      await this.client.projects.mergeRequests.notes
        .list(ctx().prNumber!, {
          id: ctx().projectID,
        })
        .then((data) => (Array.isArray(data) ? data : [data]))
        .catch((err) => {
          if (err instanceof APIError && err.status === 404) {
            return [];
          }
          throw err;
        });

    return comments.map((c) => ({ id: c.id!, body: c.body ?? "" }));
  }

  async createComment(body: string): Promise<void> {
    await this.client.projects.mergeRequests.notes.create(ctx().prNumber!, {
      id: ctx().projectID,
      body,
    });
  }

  async updateComment(id: number, body: string): Promise<void> {
    await this.client.projects.mergeRequests.notes.update(id, {
      id: ctx().projectID,
      noteable_id: ctx().prNumber!,
      body,
    });
  }

  async getPullRequestForCommit(sha: string): Promise<PullRequest | null> {
    const mergeRequests: APIEntitiesMergeRequest[] =
      await this.client.projects.repository.commits
        .retrieveMergeRequests(sha, {
          id: ctx().projectID,
        })
        // The OAS claims it's a single object, but the docs claim it's an
        // array? Just handle both.
        .then((data) => (Array.isArray(data) ? data : [data]))
        .catch((err) => {
          if (err instanceof APIError && err.status === 404) {
            return [];
          }
          throw err;
        });
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
    /**
     * Per GitLab docs, diff_refs is "Empty when the merge request is created,
     * and populates asynchronously." So we poll until it's populated.
     */
    let mergeRequest: APIEntitiesMergeRequest | null = null;

    let attempts = 0;
    while (attempts++ < 3) {
      mergeRequest = await this.client.projects.mergeRequests.retrieve(
        mergeRequestIID,
        { id: ctx().projectID },
      );

      if (
        mergeRequest?.diff_refs?.start_sha &&
        mergeRequest?.diff_refs?.head_sha
      ) {
        return {
          number: mergeRequest.iid,
          state:
            mergeRequest.state === "opened"
              ? "open"
              : mergeRequest.state === "locked"
                ? "closed"
                : (mergeRequest.state as "closed" | "merged"),
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
