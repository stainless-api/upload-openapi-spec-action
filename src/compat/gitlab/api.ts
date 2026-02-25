import { APIError } from "@stainless-api/gitlab-internal/core/error";
import type { APIEntitiesNote } from "@stainless-api/gitlab-internal/resources/projects/issues/notes/notes";
import {
  APIEntitiesMergeRequest,
  BaseMergeRequests,
} from "@stainless-api/gitlab-internal/resources/projects/merge-requests/merge-requests";
import { BaseNotes } from "@stainless-api/gitlab-internal/resources/projects/merge-requests/notes";
import { BaseCommits } from "@stainless-api/gitlab-internal/resources/projects/repository/commits";
import {
  createClient,
  PartialGitLab,
} from "@stainless-api/gitlab-internal/tree-shakable";

import { logger } from "../../logger";
import type { APIClient, Comment, PullRequest } from "../api";
import { getInput } from "../input";
import { getGitLabContext as ctx } from "./context";

class GitLabClient implements APIClient {
  private client: PartialGitLab<{
    projects: {
      repository: { commits: BaseCommits };
      mergeRequests: BaseMergeRequests & { notes: BaseNotes };
    };
  }>;

  constructor(token: string) {
    this.client = createClient({
      apiToken: token,
      baseURL: ctx().urls.api,
      resources: [BaseCommits, BaseMergeRequests, BaseNotes],
    });
  }

  async listComments(prNumber: number): Promise<Comment[]> {
    // The OAS claims it's a single object, but the docs claim it's an array.
    // Just handle both.
    const comments: APIEntitiesNote[] =
      await this.client.projects.mergeRequests.notes
        .list(prNumber, { id: ctx().projectID })
        .then((data) => (Array.isArray(data) ? data : [data]))
        .catch((err) => {
          if (err instanceof APIError && err.status === 404) {
            return [];
          }
          throw err;
        });

    return comments.map((c) => ({ id: c.id!, body: c.body ?? "" }));
  }

  async createComment(
    prNumber: number,
    props: Omit<Comment, "id">,
  ): Promise<Comment> {
    const data = await this.client.projects.mergeRequests.notes.create(
      prNumber,
      { ...props, id: ctx().projectID },
    );
    return { id: data.id!, body: data.body! };
  }

  async updateComment(prNumber: number, props: Comment): Promise<Comment> {
    const data = await this.client.projects.mergeRequests.notes.update(
      props.id as number,
      { ...props, id: ctx().projectID, noteable_id: prNumber },
    );
    return { id: data.id!, body: data.body! };
  }

  async getPullRequest(number: number): Promise<PullRequest | null> {
    /**
     * Per GitLab docs, diff_refs is "Empty when the merge request is created,
     * and populates asynchronously." So we poll until it's populated.
     */
    let mergeRequest: APIEntitiesMergeRequest | null = null;

    let attempts = 0;
    while (attempts++ < 3) {
      mergeRequest = await this.client.projects.mergeRequests.retrieve(number, {
        id: ctx().projectID,
      });

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
          title: mergeRequest.title,
          base_sha: mergeRequest.diff_refs.start_sha,
          base_ref: mergeRequest.target_branch,
          head_sha: mergeRequest.diff_refs.head_sha,
          head_ref: mergeRequest.source_branch,
          merge_commit_sha:
            mergeRequest.merge_commit_sha ||
            mergeRequest.squash_commit_sha ||
            null,
        };
      }

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 1000 * (2 ** attempts + Math.random()));
      });
    }

    logger.warn(
      `Failed to find get diff_refs for merge request after ${attempts} attempts`,
      { mergeRequestIID: number },
    );

    return null;
  }

  async getPullRequestForCommit(sha: string): Promise<PullRequest | null> {
    const mergeRequests: APIEntitiesMergeRequest[] =
      await this.client.projects.repository.commits
        .retrieveMergeRequests(sha, {
          id: ctx().projectID,
        })
        .then((data) =>
          // The OAS claims it's a single object, but the docs claim it's an
          // array? Just handle both.
          (Array.isArray(data) ? data : [data]).filter(
            (c) => c.state !== "closed" && c.state !== "locked",
          ),
        )
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
    const mergeRequest = await this.getPullRequest(mergeRequestIID);

    return mergeRequest;
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
