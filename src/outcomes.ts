import { Stainless } from "@stainless-api/sdk";
import { logger } from "./logger";

export type Outcomes = Record<
  string,
  Omit<Stainless.Builds.BuildTarget, "commit"> & {
    commit: Stainless.Builds.BuildTarget.Completed | null;
    diagnostics: Stainless.Builds.Diagnostics.BuildDiagnostic[];
    hasDiff?: boolean;
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
export type OutcomeConclusion = Exclude<(typeof OutcomeConclusion)[number], "never">;

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
    const { conclusion, reason } = categorizeOutcome({
      outcome,
      baseOutcome: baseOutcomes?.[language],
    });
    const didFail =
      conclusion &&
      OutcomeConclusion.indexOf(conclusion) <=
        OutcomeConclusion.indexOf(failRunOn);
    return didFail ? [{ language, reason }] : [];
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
}): {
  conclusion?: OutcomeConclusion;
  reason: string;
  isMergeConflict?: boolean;
  isPending?: boolean;
} {
  const baseCommitConclusion = baseOutcome?.commit?.completed?.conclusion;
  const commitConclusion = outcome.commit?.completed?.conclusion;
  const netNewCommitConclusion =
    baseCommitConclusion !== commitConclusion ? commitConclusion : undefined;

  // If we have old diagnostics, only fail run against new diagnostics.
  const diagnostics = getNewDiagnostics(
    outcome.diagnostics,
    baseOutcome?.diagnostics,
  );
  const diagnosticCounts = countDiagnosticLevels(diagnostics);

  // If we have old checks, only fail run against new checks.
  const checks = getNewChecks(outcome, baseOutcome);
  const checkFailures = CheckType.filter(
    (checkType) =>
      checks[checkType] &&
      checks[checkType].status === "completed" &&
      checks[checkType].completed.conclusion !== "success",
  );

  // Special case: noops and cancels are successful
  if (commitConclusion === "noop") {
    return {
      conclusion: "success",
      reason: "Code was not generated because the target is skipped.",
    };
  }
  if (commitConclusion === "cancelled") {
    return {
      conclusion: "success",
      reason: "Code was not generated because the build was cancelled.",
    };
  }

  if (!commitConclusion) {
    return {
      reason: "Build is still in progress.",
      isPending: true,
    };
  }

  // Fatal reasons
  if (commitConclusion === "fatal" || netNewCommitConclusion === "fatal") {
    return {
      conclusion: "fatal",
      reason: "Code was not generated because there was a fatal error.",
      isPending: outcome.commit?.status !== "completed",
    };
  }
  if (commitConclusion === "timed_out") {
    return {
      conclusion: "fatal",
      reason: "Timed out.",
    };
  }
  if (
    ![
      // Merge conflicts are warnings, not fatal:
      "merge_conflict",
      // Success conclusion are handled below:
      "error",
      "warning",
      "note",
      "success",
      // All other commit conclusions are unknown, and thus fatal.
    ].includes(commitConclusion)
  ) {
    return {
      conclusion: "fatal",
      reason: `Unknown conclusion: ${commitConclusion}`,
    };
  }
  if (diagnosticCounts.fatal > 0) {
    return {
      conclusion: "fatal",
      reason: `Found ${diagnosticCounts.fatal} fatal diagnostics.`,
    };
  }

  // Error reasons
  if (diagnosticCounts.error > 0) {
    return {
      conclusion: "error",
      reason: `Found ${diagnosticCounts.error} new error diagnostics.`,
    };
  }
  if (checkFailures.includes("build")) {
    return {
      conclusion: "error",
      reason: "The build CI job failed.",
    };
  }
  if (netNewCommitConclusion === "error") {
    return {
      conclusion: "error",
      reason: "Build had an error conclusion.",
    };
  }

  // Warning reasons
  if (diagnosticCounts.warning > 0) {
    return {
      conclusion: "warning",
      reason: `Found ${diagnosticCounts.warning} warning diagnostics.`,
    };
  }
  if (checkFailures.includes("lint")) {
    return {
      conclusion: "warning",
      reason: "The lint CI job failed.",
    };
  }
  if (checkFailures.includes("test")) {
    return {
      conclusion: "warning",
      reason: "The test CI job failed.",
    };
  }
  if (netNewCommitConclusion === "warning") {
    return {
      conclusion: "warning",
      reason: "Build had a warning conclusion.",
    };
  }
  if (netNewCommitConclusion === "merge_conflict") {
    return {
      conclusion: "warning",
      reason:
        "There was a conflict between your custom code and your generated changes.",
      isMergeConflict: true,
    };
  }

  // Note reasons
  if (diagnosticCounts.note > 0) {
    return {
      conclusion: "note",
      reason: `Found ${diagnosticCounts.note} note diagnostics.`,
    };
  }
  if (netNewCommitConclusion === "note") {
    return {
      conclusion: "note",
      reason: "Build had a note conclusion.",
    };
  }

  return {
    conclusion: "success",
    reason: "Build was successful.",
    isPending: Object.values(checks).some(
      (check) => check.status !== "completed",
    ),
  };
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

function getNewChecks(
  outcome: Outcomes[string],
  baseOutcome?: Outcomes[string],
) {
  const result = {} as Record<
    CheckType,
    NonNullable<Outcomes[string][CheckType]>
  >;

  for (const checkType of CheckType) {
    const baseConclusion =
      baseOutcome?.[checkType]?.status === "completed" &&
      baseOutcome?.[checkType].completed.conclusion;
    const conclusion =
      outcome[checkType]?.status === "completed" &&
      outcome[checkType].completed.conclusion;

    if (
      outcome[checkType] &&
      (!baseConclusion || baseConclusion !== conclusion)
    ) {
      result[checkType] = outcome[checkType];
    }
  }

  return result;
}
