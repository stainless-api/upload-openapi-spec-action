import { Stainless } from "@stainless-api/sdk";
import { logger } from "./logger";

// if a check has not started after this many seconds since the commit completed, assume it
// was skipped and mark it as such to avoid blocking the outcome indefinitely`
const ASSUME_PENDING_CHECKS_SKIPPED_AFTER_SECS = 60;

export type Outcomes = Record<
  string,
  Omit<Stainless.Builds.BuildTarget, "commit"> & {
    commit: Stainless.Builds.BuildTarget.Completed | null;
    diagnostics: Stainless.Builds.Diagnostics.BuildDiagnostic[];
  }
>;

export const FailRunOn = [
  "never",
  "fatal",
  "error",
  "warning",
  "note",
] as const;
export type FailRunOn = (typeof FailRunOn)[number];

const OutcomeConclusion = [...FailRunOn, "success"] as const;
type OutcomeConclusion = (typeof OutcomeConclusion)[number];

export function shouldFailRun({
  failRunOn,
  outcomes,
  baseOutcomes,
}: {
  failRunOn: FailRunOn;
  outcomes: Outcomes;
  baseOutcomes?: Outcomes | null;
}) {
  const failures = Object.entries(outcomes).flatMap(([language, outcome]) => {
    const categorized = categorizeOutcome({
      outcome,
      baseOutcome: baseOutcomes?.[language],
    });

    if (categorized.isPending) {
      return [];
    }

    const { severity, isRegression, description } = categorized;

    const didFail =
      isRegression !== false &&
      severity &&
      OutcomeConclusion.indexOf(severity) <=
        OutcomeConclusion.indexOf(failRunOn);
    return didFail
      ? [
          {
            language,
            reason: getReason({
              description,
              isRegression,
            }),
          },
        ]
      : [];
  });

  if (failures.length > 0) {
    logger.warn("The following languages did not build successfully:");
    for (const { language, reason } of failures) {
      logger.warn(`  ${language}: ${reason}`);
    }
    return false;
  }

  return true;
}

export function categorizeOutcome({
  outcome,
  baseOutcome,
}: {
  outcome: Outcomes[string];
  baseOutcome?: Outcomes[string];
}):
  | {
      isPending: false;
      conclusion: Stainless.Builds.BuildTarget.Completed["conclusion"];
      severity: Exclude<FailRunOn, "never"> | null;
      description: string;
      // true if the outcome is worse than the base outcome, false if it's not worse, null if there is no base outcome
      isRegression: boolean | null;
    }
  | {
      isPending: true;
    } {
  const baseConclusion = baseOutcome?.commit?.conclusion;
  const headConclusion = outcome.commit?.conclusion;
  if (!headConclusion || (baseOutcome && !baseConclusion)) {
    return { isPending: true };
  }

  const baseChecks =
    baseOutcome && baseOutcome.commit?.commit
      ? getChecks(baseOutcome)
      : ({} as Record<string, Stainless.Builds.CheckStep>);
  const headChecks = outcome.commit?.commit
    ? getChecks(outcome)
    : ({} as Record<string, Stainless.Builds.CheckStep>);

  // wait for all checks to complete
  if (
    [...Object.values(headChecks), ...Object.values(baseChecks)].some(
      (check) => check && check.status !== "completed",
    )
  ) {
    return { isPending: true };
  }

  const newDiagnostics = sortDiagnostics(
    baseOutcome
      ? getNewDiagnostics(outcome.diagnostics, baseOutcome.diagnostics)
      : outcome.diagnostics,
  );

  const conclusions = {
    fatal: [
      "fatal",
      "payment_required",
      "timed_out",
      "upstream_merge_conflict",
      "version_bump",
    ],
    conflict: ["merge_conflict"],
    diagnostic: ["error", "warning", "note"],
    success: ["success", "noop", "cancelled"],
  };

  const checks = getNewChecks(headChecks, baseChecks);
  const checkFailures = CheckType.filter(
    (checkType) =>
      checks[checkType] &&
      checks[checkType].status === "completed" &&
      ["failure", "timed_out"].includes(checks[checkType].completed.conclusion),
  );

  if (conclusions.fatal.includes(headConclusion)) {
    return {
      isPending: false,
      conclusion: "fatal",
      severity: "fatal",
      description: `had a "${headConclusion}" conclusion, and no code was generated`,
      isRegression: baseConclusion
        ? conclusions.fatal.includes(baseConclusion)
          ? false
          : true
        : null,
    };
  }
  if (
    conclusions.diagnostic.includes(headConclusion) ||
    newDiagnostics.length > 0 ||
    checkFailures.length > 0
  ) {
    const categoryOutcome = conclusions.diagnostic.includes(headConclusion)
      ? {
          severity: headConclusion as Exclude<FailRunOn, "never">,
          description: `had at least one "${headConclusion}" diagnostic`,
          isRegression: baseConclusion
            ? conclusions.success.includes(baseConclusion) ||
              conclusions.diagnostic.indexOf(headConclusion) <
                conclusions.diagnostic.indexOf(baseConclusion)
              ? true
              : false
            : null,
          rank: 1,
        }
      : null;

    const diagnosticLevelOutcome =
      newDiagnostics.length > 0
        ? {
            severity: newDiagnostics[0].level as Exclude<FailRunOn, "never">,
            description: `had at least one ${baseOutcome ? "new " : ""}${newDiagnostics[0].level} diagnostic`,
            isRegression: baseOutcome ? true : null,
            rank: 2,
          }
        : null;

    let checkFailureOutcome;
    for (const { step, severity } of [
      { step: "build", severity: "error" } as const,
      { step: "lint", severity: "warning" } as const,
      { step: "test", severity: "warning" } as const,
    ]) {
      if (checkFailures.includes(step)) {
        checkFailureOutcome = {
          severity: severity as Exclude<FailRunOn, "never">,
          description: `had a failure in the ${step} CI job`,
          isRegression: baseChecks ? true : null,
          rank: 3,
        };
        break;
      }
    }

    const worstOutcome = [
      categoryOutcome,
      diagnosticLevelOutcome,
      checkFailureOutcome,
    ]
      .filter((r): r is Exclude<typeof categoryOutcome, null> => r !== null)
      .sort(
        (a, b) =>
          // sort by severity then rank
          conclusions.diagnostic.indexOf(a.severity) -
            conclusions.diagnostic.indexOf(b.severity) || a.rank - b.rank,
      )[0];

    return {
      isPending: false,
      conclusion: headConclusion,
      ...worstOutcome,
    };
  }
  if (conclusions.conflict.includes(headConclusion)) {
    return {
      isPending: false,
      conclusion: "merge_conflict",
      severity: baseConclusion !== "merge_conflict" ? "warning" : null,
      description:
        "resulted in a merge conflict between your custom code and the newly generated changes",
      isRegression: baseConclusion
        ? baseConclusion !== "merge_conflict"
          ? true
          : false
        : null,
    };
  }

  return {
    isPending: false,
    conclusion: headConclusion,
    severity: null,
    description:
      headConclusion === "success"
        ? "was successful"
        : `had a conclusion of ${headConclusion}`,
    isRegression: baseConclusion ? false : null,
  };
}

export function getReason({
  description,
  isRegression,
}: {
  description: string;
  isRegression: boolean | null;
}) {
  return `Your SDK build ${description}${isRegression === true ? ", which is a regression from the base state" : isRegression === false ? ", but this did not represent a regression" : ""}.`;
}

export const DiagnosticLevel = ["fatal", "error", "warning", "note"] as const;
export type DiagnosticLevel = (typeof DiagnosticLevel)[number];

export function countDiagnosticLevels(
  diagnostics: Outcomes[string]["diagnostics"],
) {
  return diagnostics.reduce(
    (counts, diag) => {
      counts[diag.level] = (counts[diag.level] || 0) + 1;
      return counts;
    },
    {
      fatal: 0,
      error: 0,
      warning: 0,
      note: 0,
    } satisfies Record<DiagnosticLevel, number>,
  );
}

export function getNewDiagnostics(
  diagnostics: Outcomes[string]["diagnostics"],
  baseDiagnostics?: Outcomes[string]["diagnostics"],
) {
  if (!baseDiagnostics) {
    return diagnostics;
  }

  return diagnostics.filter(
    (d) =>
      !baseDiagnostics.some(
        (bd) =>
          bd.code === d.code &&
          bd.message === d.message &&
          bd.config_ref === d.config_ref &&
          bd.oas_ref === d.oas_ref,
      ),
  );
}

export function sortDiagnostics(diagnostics: Outcomes[string]["diagnostics"]) {
  return diagnostics.sort(
    (a, b) =>
      DiagnosticLevel.indexOf(a.level) - DiagnosticLevel.indexOf(b.level),
  );
}

const CheckType = ["build", "lint", "test"] as const;
type CheckType = (typeof CheckType)[number];

function getChecks(
  outcome: Outcomes[string],
): Record<CheckType, Outcomes[string][CheckType] | null> {
  const results = {} as Record<CheckType, Outcomes[string][CheckType] | null>;

  const commitCompletedMoreThanXSecsAgo = outcome.commit
    ? new Date().getTime() - new Date(outcome.commit.completed_at).getTime() > ASSUME_PENDING_CHECKS_SKIPPED_AFTER_SECS * 1000
    : false;

  for (const checkType of CheckType) {
    if (outcome[checkType]?.status === "not_started" && commitCompletedMoreThanXSecsAgo) {
      outcome[checkType] = {
        status: "completed",
        conclusion: "skipped",
        completed: {
          conclusion: "skipped",
          url: null,
        },
        url: null,
      }
    }

    results[checkType] = outcome[checkType] || null;
  }

  return results;
}

function getNewChecks(
  headChecks: Record<CheckType, Outcomes[string][CheckType] | null>,
  baseChecks?: Record<CheckType, Outcomes[string][CheckType] | null> | null,
) {
  const result = {} as Record<
    CheckType,
    NonNullable<Outcomes[string][CheckType]>
  >;

  for (const checkType of CheckType) {
    const headCheck = headChecks[checkType];
    const baseCheck = baseChecks ? baseChecks[checkType] : null;

    if (headCheck) {
      const baseConclusion =
        baseCheck?.status === "completed" && baseCheck.conclusion;
      const conclusion =
        headCheck.status === "completed" && headCheck.conclusion;

      if (!baseConclusion || baseConclusion !== conclusion) {
        result[checkType] = headCheck;
      }
    }
  }

  return result;
}
