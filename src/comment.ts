import * as github from "@actions/github";
import { Comments as GitHubComments } from "@stainless-api/github-internal/resources/repos/issues/comments";
import { createClient as createGitHubClient } from "@stainless-api/github-internal/tree-shakable";
import type { Stainless } from "@stainless-api/sdk";
import { Outcomes } from "./build";
import * as MD from "./markdown";

type DiagnosticLevel =
  Stainless.Builds.Diagnostics.DiagnosticListResponse["level"];

const DiagnosticIcon: Record<DiagnosticLevel, string> = {
  fatal: MD.Symbol.Exclamation,
  error: MD.Symbol.Exclamation,
  warning: MD.Symbol.Warning,
  note: MD.Symbol.Bulb,
};

type PrintCommentOptions = {
  noChanges: boolean;
  orgName: string;
  projectName: string;
  branch: string;
  commitMessage: string;
  baseOutcomes?: Outcomes | null;
  outcomes: Outcomes;
};

const COMMENT_TITLE = MD.Heading(
  `${MD.Symbol.HeavyAsterisk} Stainless SDK previews`,
);

export function printComment({
  noChanges,
  orgName,
  projectName,
  branch,
  commitMessage,
  baseOutcomes,
  outcomes,
}:
  | ({ noChanges?: never } & Omit<PrintCommentOptions, "noChanges">)
  | ({ noChanges: true } & {
      [K in keyof Omit<PrintCommentOptions, "noChanges">]?: never;
    })) {
  const blocks = (() => {
    if (noChanges) {
      return "No changes were made to the SDKs.";
    }

    const details = getDetails({ base: baseOutcomes, head: outcomes });

    return [
      printCommitMessage({
        commitMessage,
        projectName,
        // Can edit if this is a preview comment (and thus baseOutcomes exist).
        // Otherwise, this is post-merge and editing it won't do anything.
        canEdit: !!baseOutcomes,
      }),
      printFailures({ orgName, projectName, branch, outcomes }),
      printMergeConflicts({ projectName, outcomes }),
      printRegressions({ orgName, projectName, branch, details }),
      printSuccesses({ orgName, projectName, branch, details }),
      printPending({ details }),
    ]
      .filter((f): f is string => f !== null)
      .join(`\n\n`);
  })();

  return MD.Dedent`
    ${COMMENT_TITLE}

    ${MD.Italic(
      `Last updated: ${new Date()
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, " UTC")}`,
    )}

    ${blocks}
  `;
}

function printCommitMessage({
  commitMessage,
  projectName,
  canEdit,
}: {
  commitMessage: string;
  projectName: string;
  canEdit: boolean;
}) {
  return MD.Dedent`
    ${MD.Symbol.SpeechBalloon} This PR updates ${MD.CodeInline(projectName)} SDKs with this commit message.${canEdit ? " To change the commit message, edit this comment." : ""}

    ${canEdit ? MD.Comment("Replace the contents of this code block with your commit message. Use a commit message in the conventional commits format: https://www.conventionalcommits.org/en/v1.0.0/") : ""}
    ${MD.CodeBlock(commitMessage)}
  `;
}

function printFailures({
  orgName,
  projectName,
  branch,
  outcomes,
}: {
  orgName: string;
  projectName: string;
  branch: string;
  outcomes: Outcomes;
}) {
  const failures = Object.entries(outcomes)
    .map<[string, string] | null>(([lang, outcome]) => {
      switch (outcome.commit.completed.conclusion) {
        case "noop":
        case "error":
        case "warning":
        case "note":
        case "success":
        case "merge_conflict":
        case "upstream_merge_conflict": {
          // non-failures
          return null;
        }
        case "fatal": {
          return [lang, `Fatal error.`];
        }
        case "timed_out": {
          return [lang, `Timed out.`];
        }
        default: {
          return [
            lang,
            `Unknown conclusion (${MD.CodeInline(outcome.commit.completed.conclusion)}).`,
          ];
        }
      }
    })
    .filter((f): f is [string, string] => f !== null);

  if (!failures.length) {
    return null;
  }

  const studioURL = getStudioURL({ orgName, projectName, branch });
  const studioLink = MD.Link({ text: "Stainless Studio", href: studioURL });

  return MD.Dedent`
    ${MD.Symbol.Exclamation} ${MD.Bold("Failures.")} See the ${studioLink} for details.

    ${MD.List(
      failures.map(([lang, message]) => `${projectName}-${lang}: ${message}`),
    )}
  `;
}

function printMergeConflicts({
  projectName,
  outcomes,
}: {
  projectName: string;
  outcomes: Outcomes;
}) {
  const mergeConflicts = Object.entries(outcomes)
    .map<[string, string] | null>(([lang, outcome]) => {
      if (!outcome.commit.completed.merge_conflict_pr) {
        return null;
      }
      const {
        number,
        repo: { owner, name },
      } = outcome.commit.completed.merge_conflict_pr!;
      const url = `https://github.com/${owner}/${name}/pull/${number}`;
      if (outcome.commit.completed.conclusion === "upstream_merge_conflict") {
        return [
          lang,
          `The base branch has a conflict. ${MD.Link({ text: "Link to conflict.", href: url })}`,
        ];
      }
      return [lang, `${MD.Link({ text: "Link to conflict.", href: url })}`];
    })
    .filter((f): f is [string, string] => f !== null);

  if (!mergeConflicts.length) {
    return null;
  }

  const runURL = `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
  return MD.Dedent`
    ${MD.Symbol.Zap} ${MD.Bold("Merge conflicts.")} You can resolve conflicts now; if you do, ${MD.Link({ text: "re-run this GitHub action", href: runURL })} to get diffs. If you merge before resolving conflicts, new conflict PRs will be created after merging.

    ${MD.List(mergeConflicts.map(([lang, message]) => `${projectName}-${lang}: ${message}`))}
  `;
}

type Details = Record<
  string,
  {
    githubLink: string | null;
    compareLink: string | null;
    details: string[];
    isPending: boolean;
    isRegression: boolean;
  }
>;

function getDetails({
  base,
  head,
}: {
  base?: Outcomes | null;
  head: Outcomes;
}) {
  const result: Details = {};

  for (const [lang, outcome] of Object.entries(head)) {
    if (
      !["error", "warning", "note", "success"].includes(
        outcome.commit.completed.conclusion,
      )
    ) {
      continue;
    }

    const details: string[] = [];
    const baseOutcome = base?.[lang];
    let githubLink: string | null = null;
    let compareLink: string | null = null;
    let isPending = false;
    let isRegression = false;

    // Get the GitHub link:
    if (outcome.commit.completed.commit) {
      const {
        repo: { owner, name, branch },
      } = outcome.commit.completed.commit;
      const githubURL = `https://github.com/${owner}/${name}/tree/${branch}`;
      githubLink = MD.Link({ text: "code", href: githubURL });
    }

    // Get the diff link:
    if (
      baseOutcome?.commit.completed.commit &&
      outcome.commit.completed.commit
    ) {
      const {
        repo: { owner, name },
      } = outcome.commit.completed.commit;
      const base = baseOutcome.commit.completed.commit.repo.branch;
      const head = outcome.commit.completed.commit.repo.branch;
      const compareURL = `https://github.com/${owner}/${name}/compare/${base}..${head}`;
      // TODO: can we get a label with stats?
      compareLink = MD.Link({ text: "diff", href: compareURL });
    }

    // Show a check if it fails, but previously succeeded or didn't exist:
    for (const check of ["build", "lint", "test"] as const) {
      const checkName =
        check === "build" ? "Build" : check === "lint" ? "Lint" : "Test";

      if (
        (!baseOutcome?.[check] ||
          (baseOutcome[check].status === "completed" &&
            baseOutcome[check].completed.conclusion === "success")) &&
        outcome[check] &&
        outcome[check].status === "completed" &&
        outcome[check].completed.conclusion === "failure"
      ) {
        const baseURL =
          baseOutcome?.[check]?.status === "completed"
            ? baseOutcome[check].completed.url
            : null;
        const baseText = `${MD.Symbol.WhiteCheckMark} success`;
        const baseLink = baseURL
          ? MD.Link({ text: baseText, href: baseURL })
          : null;

        const headURL = outcome[check].completed.url;
        const headText = `${MD.Symbol.Exclamation} failure`;
        const headLink = headURL
          ? MD.Link({ text: headText, href: headURL })
          : headText;

        if (baseLink) {
          details.push(
            `${checkName}: ${baseLink} ${MD.Symbol.RightwardsArrow} ${headLink}`,
          );
        } else {
          details.push(`${checkName}: ${headLink}`);
        }

        isRegression = true;
      }

      if (
        (baseOutcome?.[check] && baseOutcome[check].status !== "completed") ||
        (outcome[check] && outcome[check].status !== "completed")
      ) {
        details.push(`${checkName}: ${MD.Symbol.HourglassFlowingSand} pending`);
        isPending = true;
      }
    }

    // New diagnostics. Show count of every severity, but only show the details
    // of the first few diagnostics. Regression if we have a new non-info
    // diagnostic.
    if (baseOutcome?.diagnostics && outcome.diagnostics) {
      const newDiagnostics = outcome.diagnostics.filter(
        (d) =>
          !baseOutcome.diagnostics.some(
            (bd) =>
              bd.code === d.code &&
              bd.message === d.message &&
              bd.config_ref === d.config_ref &&
              bd.oas_ref === d.oas_ref,
          ),
      );
      if (newDiagnostics.length > 0) {
        const levelCounts: Record<DiagnosticLevel, number> = {
          fatal: 0,
          error: 0,
          warning: 0,
          note: 0,
        };

        for (const d of newDiagnostics) {
          levelCounts[d.level]++;
        }

        if (
          levelCounts.fatal > 0 ||
          levelCounts.error > 0 ||
          levelCounts.warning > 0
        ) {
          isRegression = true;
        }

        const diagnosticCounts = Object.entries(levelCounts)
          .filter(([, count]) => count > 0)
          .map(([level, count]) => `${count} ${level}`);

        let hasOmittedDiagnostics = newDiagnostics.length > 10;
        const diagnosticList = newDiagnostics
          .slice(0, 10)
          .map((d) => {
            if (d.level === "note") {
              hasOmittedDiagnostics = true;
              return null;
            }
            return `${DiagnosticIcon[d.level]} ${MD.Bold(d.code)}: ${d.message}`;
          })
          .filter(Boolean) as string[];

        details.push(
          MD.Details({
            summary: `New diagnostics (${diagnosticCounts.join(", ")})`,
            body: MD.Dedent`
              ${hasOmittedDiagnostics ? "Some diagnostics omitted. " : ""}See the Stainless Studio for more details.

              ${MD.List(diagnosticList)}
            `,
          }),
        );
      }
    }

    // Installation instructions:
    const installation = getInstallation(lang, outcome);
    if (installation) {
      details.push(
        MD.Details({
          summary: "Installation",
          body: MD.CodeBlock({ content: installation, language: "bash" }),
          indent: false,
        }),
      );
    }

    result[lang] = {
      githubLink,
      compareLink,
      details,
      isPending,
      isRegression,
    };
  }

  return result;
}

function printRegressions({
  orgName,
  projectName,
  branch,
  details,
}: {
  orgName: string;
  projectName: string;
  branch: string;
  details: Details;
}) {
  const regressions = Object.entries(details).filter(
    ([, { isRegression }]) => isRegression,
  );

  if (regressions.length === 0) {
    return null;
  }

  const formattedRegressions = regressions.map(
    ([lang, { githubLink, compareLink, details }]) => {
      const studioURL = getStudioURL({
        orgName,
        projectName,
        language: lang,
        branch,
      });
      const studioLink = MD.Link({ text: "studio", href: studioURL });

      const headingLinks = [studioLink, githubLink, compareLink]
        .filter((link): link is string => link !== null)
        .join(` ${MD.Symbol.MiddleDot} `);

      return MD.Details({
        summary: `${projectName}-${lang}: ${headingLinks}`,
        body: details.join("\n\n"),
        open: true,
      });
    },
  );

  return MD.Dedent`
    ${MD.Symbol.Warning} ${MD.Bold("Regressions.")}

    ${formattedRegressions.join("\n\n")}
  `;
}

function printSuccesses({
  orgName,
  projectName,
  branch,
  details,
}: {
  orgName: string;
  projectName: string;
  branch: string;
  details: Details;
}) {
  const successes = Object.entries(details).filter(
    ([, { isPending, isRegression }]) => !isPending && !isRegression,
  );

  if (successes.length === 0) {
    return null;
  }

  const formattedSuccesses = successes.map(
    ([lang, { githubLink, compareLink, details }]) => {
      const studioURL = getStudioURL({
        orgName,
        projectName,
        language: lang,
        branch,
      });
      const studioLink = MD.Link({ text: "studio", href: studioURL });

      const headingLinks = [studioLink, githubLink, compareLink]
        .filter((link): link is string => link !== null)
        .join(` ${MD.Symbol.MiddleDot} `);
      const summary = `${projectName}-${lang}: ${headingLinks}`;

      return details.length > 0
        ? MD.Details({ summary, body: details.join("\n\n") })
        : `- ${summary}`;
    },
  );

  return MD.Dedent`
    ${MD.Symbol.WhiteCheckMark} ${MD.Bold("Successes.")}

    ${formattedSuccesses.join("\n\n")}
  `;
}

function printPending({ details }: { details: Details }) {
  const hasPending = Object.values(details).some(({ isPending }) => isPending);

  if (!hasPending) {
    return null;
  }

  return MD.Dedent`
    ${MD.Symbol.HourglassFlowingSand} These are partial results; builds are still running.
  `;
}

function getInstallation(lang: string, outcome: Outcomes[string]) {
  if (!outcome.commit.completed.commit) {
    return null;
  }

  const { repo } = outcome.commit.completed.commit;

  // TODO: update the API to return a URL, under build, and use that
  switch (lang) {
    case "typescript":
    case "node": {
      return `npm install ${getGitHubURL({ repo })}`;
    }
    case "python": {
      return `pip install git+${getGitHubURL({ repo })}`;
    }
    default: {
      return null;
    }
  }
}

function getGitHubURL({
  repo,
}: {
  repo: { owner: string; name: string; branch: string };
}) {
  return `https://github.com/${repo.owner}/${repo.name}.git#${repo.branch}`;
}

function getStudioURL({
  orgName,
  projectName,
  language,
  branch,
}: {
  orgName: string;
  projectName: string;
  language?: string;
  branch: string;
}) {
  if (language) {
    return `https://app.stainless.com/${orgName}/${projectName}/studio?language=${language}&branch=${branch}`;
  }
  return `https://app.stainless.com/${orgName}/${projectName}/studio?branch=${branch}`;
}

export function parseCommitMessage(body?: string | null) {
  return body?.match(/(?<!\\)```([\s\S]*?)(?<!\\)```/)?.[1].trim() ?? null;
}

export async function retrieveComment({ token }: { token: string }) {
  const client = createGitHubClient({
    authToken: token,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    resources: [GitHubComments],
  });

  const { data: comments } = await client.repos.issues.comments.list(
    github.context.issue.number,
  );

  const existingComment =
    comments.find((comment) => comment.body?.includes(COMMENT_TITLE)) ?? null;

  return {
    id: existingComment?.id,
    commitMessage: parseCommitMessage(existingComment?.body),
  };
}

export async function upsertComment({
  body,
  token,
  skipCreate = false,
}: {
  body: string;
  token: string;
  skipCreate?: boolean;
}) {
  const client = createGitHubClient({
    authToken: token,
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    resources: [GitHubComments],
  });

  console.log("Upserting comment on PR:", github.context.issue.number);

  const { data: comments } = await client.repos.issues.comments.list(
    github.context.issue.number,
  );

  const firstLine = body.trim().split("\n")[0];
  const existingComment = comments.find((comment) =>
    comment.body?.includes(firstLine),
  );

  if (existingComment) {
    console.log("Updating existing comment:", existingComment.id);
    await client.repos.issues.comments.update(existingComment.id, { body });
  } else if (!skipCreate) {
    console.log("Creating new comment");
    await client.repos.issues.comments.create(github.context.issue.number, {
      body,
    });
  }
}
