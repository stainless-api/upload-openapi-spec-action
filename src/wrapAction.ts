import Stainless from "@stainless-api/sdk";
import { getInput } from "./compat/input";
import { getStainlessAuth } from "./compat";
import { resolveProject } from "./resolve";
import { createAutoRefreshFetch, getStainlessClient } from "./stainless";
import { logger } from "./logger";

export type ActionContext = {
  stainless: Stainless;
  projectName: string;
  orgName: string | undefined;
};

const accumulatedBuildIds = new Set<string>();

export function addBuildIdForTelemetry(buildId: string) {
  accumulatedBuildIds.add(buildId);
}

/**
 * Wrap the body of an action, providing the Stainless client and additionally reporting
 * success/error results if telemetry is enabled.
 *
 * **Important:** The action must have a Stainless auth token for this to work.
 * The `project` and `org` inputs are optional and will be auto-detected when not provided.
 */
export function wrapAction(
  actionType: string,
  fn: (context: ActionContext) => Promise<void>,
): () => Promise<void> {
  return async () => {
    let stainless: Stainless | undefined;
    let projectName: string | undefined;
    let orgName: string | undefined;

    try {
      const projectInput =
        getInput("project", { required: false }) || undefined;
      const auth = await getStainlessAuth();

      const client = getStainlessClient(actionType, {
        apiKey: auth.key,
        logLevel: "warn",
        fetch: createAutoRefreshFetch(auth, getStainlessAuth),
      });

      const resolved = await resolveProject(client, projectInput);
      projectName = resolved.projectName;
      stainless = client.withOptions({ project: projectName });
      orgName = getInput("org", { required: false }) || resolved.orgName;

      await fn({ stainless, projectName, orgName });
      await maybeReportResult({
        stainless,
        orgName,
        projectName,
        actionType,
        successOrError: { result: "success" },
      });
    } catch (error) {
      logger.fatal("Error in action:", error);
      if (stainless) {
        await maybeReportResult({
          stainless,
          orgName,
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
  org?: string;
  project?: string;
  build_ids?: string[];
  action_type: string;
} & ReportResultSuccessOrError;

async function maybeReportResult({
  stainless,
  orgName,
  projectName,
  actionType,
  successOrError,
}: {
  stainless: Stainless;
  orgName?: string;
  projectName?: string;
  actionType: string;
  successOrError: ReportResultSuccessOrError;
}) {
  if (process.env.STAINLESS_DISABLE_TELEMETRY) {
    return;
  }

  try {
    const body: ReportResultBody = {
      org: orgName,
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
