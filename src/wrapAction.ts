import Stainless from "@stainless-api/sdk";
import { getInput } from "./compat/input";
import { setApiKey } from "./compat";
import { getStainlessClient } from "./stainless";
import { logger } from "./logger";

const accumulatedBuildIds = new Set<string>();

export function addBuildIdForTelemetry(buildId: string) {
  accumulatedBuildIds.add(buildId);
}

/**
 * Wrap the body of an action, providing the Stainless client and additionally reporting
 * success/error results if telemetry is enabled.
 *
 * **Important:** The action must have a `project` input and a Stainless auth token
 * for this to work.
 */
export function wrapAction(
  actionType: string,
  fn: (stainless: Stainless) => Promise<void>,
): () => Promise<void> {
  return async () => {
    let stainless: Stainless | undefined;
    let projectName: string | undefined;

    try {
      projectName = getInput("project", { required: true });
      stainless = getStainlessClient(actionType, {
        project: projectName,
        logLevel: "warn",
      });

      await setApiKey(stainless);

      await fn(stainless);
      await maybeReportResult({
        stainless,
        projectName,
        actionType,
        successOrError: { result: "success" },
      });
    } catch (error) {
      logger.fatal("Error in action:", error);
      if (stainless) {
        await maybeReportResult({
          stainless,
          projectName,
          actionType,
          successOrError: serializeError(error),
        });
      }
      process.exit(1);
    }
  };
}

type ReportResultSuccessOrError =
  | { result: "success" }
  | {
      result: "error";
      error_message: string;
      error_stack?: string;
      error_name?: string;
    };

function serializeError(
  error: unknown,
): Extract<ReportResultSuccessOrError, { result: "error" }> {
  const maybeTypedError = error instanceof Error ? error : undefined;
  return {
    result: "error",
    error_message: maybeTypedError?.message ?? String(error),
    error_name: maybeTypedError?.name,
    error_stack: maybeTypedError?.stack,
  };
}

type ReportResultBody = {
  project?: string;
  build_ids?: string[];
  action_type: string;
} & ReportResultSuccessOrError;

async function maybeReportResult({
  stainless,
  projectName,
  actionType,
  successOrError,
}: {
  stainless: Stainless;
  projectName?: string;
  actionType: string;
  successOrError: ReportResultSuccessOrError;
}) {
  if (process.env.STAINLESS_DISABLE_TELEMETRY) {
    return;
  }

  try {
    const body: ReportResultBody = {
      project: projectName,
      build_ids: [...accumulatedBuildIds],
      action_type: actionType,
      ...successOrError,
    };

    await stainless.post("/api/reports/action-result", {
      body,
    });
  } catch (error) {
    logger.error("Error reporting result to Stainless", error);
  }
}
