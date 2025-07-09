import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Outcomes } from "./build";
import { parseCommitMessage, printComment } from "./comment";
import * as MD from "./markdown";

vi.mock("@actions/github", () => {
  return {
    context: {
      repo: {
        owner: "test-org",
        repo: "test-sdk",
      },
      runId: 200,
    },
  };
});

describe("printComment", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2000-01-01"));
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should print no changes comment", () => {
    expect(printComment({ noChanges: true })).toMatchInlineSnapshot(`
      "<h3>✱ Stainless SDK previews</h3>

      <i>Last updated: 2000-01-01 00:00:00 UTC</i>

      No changes were made to the SDKs."
    `);
  });

  it("should print comment", () => {
    const baseOutcomes = {
      typescript: {
        object: "build_target",
        status: "completed",
        commit: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: {
              sha: "def456",
              repo: {
                owner: "test-org",
                name: "test-sdk",
                branch: "base-branch",
              },
            },
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/199",
          },
        },
        build: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: null,
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/200",
          },
        },
        lint: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: null,
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/201",
          },
        },
        test: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: null,
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/202",
          },
        },
        diagnostics: [
          {
            level: "warning",
            code: "Warning",
            message: "Warning",
            ignored: false,
          },
        ],
      },
    } satisfies Outcomes;

    const outcomes = {
      python: {
        object: "build_target",
        status: "completed",
        commit: {
          status: "completed",
          completed: {
            conclusion: "fatal",
            commit: null,
            merge_conflict_pr: null,
            url: null,
          },
        },
        lint: {
          status: "not_started",
        },
        test: {
          status: "not_started",
        },
        diagnostics: [],
      },
      go: {
        object: "build_target",
        status: "completed",
        commit: {
          status: "completed",
          completed: {
            conclusion: "merge_conflict",
            commit: null,
            merge_conflict_pr: {
              number: 1,
              repo: {
                owner: "test-org",
                name: "test-sdk",
              },
            },
            url: null,
          },
        },
        lint: {
          status: "not_started",
        },
        test: {
          status: "not_started",
        },
        diagnostics: [],
      },
      typescript: {
        object: "build_target",
        status: "completed",
        commit: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: {
              sha: "abc123",
              repo: {
                owner: "test-org",
                name: "test-sdk",
                branch: "feature-branch",
              },
            },
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/210",
          },
        },
        build: {
          status: "completed",
          completed: {
            conclusion: "failure",
            commit: null,
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/211",
          },
        },
        lint: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: null,
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/212",
          },
        },
        test: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: null,
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/213",
          },
        },
        diagnostics: [
          {
            level: "error",
            code: "Error",
            message: "Error",
            ignored: false,
          },
          {
            level: "warning",
            code: "Warning",
            message: "Warning",
            ignored: false,
          },
          {
            level: "warning",
            code: "Warning",
            message: "Other warning",
            ignored: false,
          },
        ],
      },
      java: {
        object: "build_target",
        status: "completed",
        commit: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: {
              sha: "abc123",
              repo: {
                owner: "test-org",
                name: "test-sdk",
                branch: "feature-branch",
              },
            },
            merge_conflict_pr: null,
            url: null,
          },
        },
        lint: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: null,
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/213",
          },
        },
        test: {
          status: "not_started",
        },
        diagnostics: [],
      },
      kotlin: {
        object: "build_target",
        status: "completed",
        commit: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: {
              sha: "abc123",
              repo: {
                owner: "test-org",
                name: "test-sdk",
                branch: "feature-branch",
              },
            },
            merge_conflict_pr: null,
            url: null,
          },
        },
        lint: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: null,
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/213",
          },
        },
        test: {
          status: "completed",
          completed: {
            conclusion: "success",
            commit: null,
            merge_conflict_pr: null,
            url: "https://github.com/test-org/test-sdk/actions/runs/214",
          },
        },
        diagnostics: [],
      },
    } satisfies Outcomes;

    expect(
      printComment({
        orgName: "test-org",
        projectName: "test-project",
        branch: "feature-branch",
        commitMessage: "Update API endpoints",
        baseOutcomes,
        outcomes,
      }),
    ).toMatchSnapshot();
  });
});

describe("parseCommitMessage", () => {
  it("should parse commit message", () => {
    const commitMessage = MD.Dedent(`
      feat(api): add new thing

      This is related to #243
    `);

    expect(
      parseCommitMessage(
        MD.Dedent(`
          ${MD.Symbol.SpeechBalloon} This PR updates ${MD.CodeInline("test-project")} SDKs with this commit message.

          ${MD.CodeBlock(commitMessage)}
        `),
      ),
    ).toBe(commitMessage);
  });
});
