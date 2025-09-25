import { Stainless } from "@stainless-api/sdk";

type Build = Stainless.Builds.BuildObject;
export type Outcomes = Record<
  string,
  Omit<Stainless.Builds.BuildTarget, "commit"> & {
    commit: Stainless.Builds.BuildTarget.Completed | null;
    diagnostics: Stainless.Builds.Diagnostics.DiagnosticListResponse[];
  }
>;

const POLLING_INTERVAL_SECONDS = 5;
const MAX_POLLING_SECONDS = 10 * 60; // 10 minutes

export type RunResult = {
  baseOutcomes: Outcomes | null;
  outcomes: Outcomes;
  documentedSpec: string | null;
};

export async function* runBuilds({
  stainless,
  projectName,
  baseBranch,
  mergeBranch,
  branch,
  branchFrom,
  oasContent,
  configContent,
  baseOasContent,
  baseConfigContent,
  guessConfig = false,
  commitMessage,
  allowEmpty = true,
}: {
  stainless: Stainless;
  projectName: string;
  baseBranch?: string;
  mergeBranch?: string;
  branch: string;
  branchFrom?: string;
  oasContent?: string;
  configContent?: string;
  baseOasContent?: string;
  baseConfigContent?: string;
  guessConfig?: boolean;
  commitMessage?: string;
  allowEmpty?: boolean;
}): AsyncGenerator<RunResult> {
  if (mergeBranch && (oasContent || configContent)) {
    throw new Error(
      "Cannot specify both merge_branch and oas_path or config_path",
    );
  }
  if (guessConfig && (configContent || !oasContent)) {
    throw new Error(
      "If guess_config is true, must have oas_path and no config_path",
    );
  }
  if (branchFrom && mergeBranch) {
    throw new Error("Cannot specify both branch_from and merge_branch");
  }

  if (!branchFrom) {
    const build = await stainless.builds.create(
      {
        project: projectName,
        revision: mergeBranch
          ? `${branch}..${mergeBranch}`
          : {
              ...(oasContent && {
                "openapi.yml": {
                  content: oasContent,
                },
              }),
              ...(configContent && {
                "openapi.stainless.yml": {
                  content: configContent,
                },
              }),
            },
        branch,
        commit_message: commitMessage,
        allow_empty: allowEmpty,
      },
      {
        // For very large specs, writing the config files can take a while.
        timeout: 3 * 60 * 1000,
      },
    );

    for await (const { outcomes, documentedSpec } of pollBuild({
      stainless,
      build,
      label: "head",
    })) {
      yield {
        baseOutcomes: null,
        outcomes,
        documentedSpec,
      };
    }

    return;
  }

  if (!configContent) {
    const hasBranch =
      !!branch &&
      !!(await stainless.projects.branches.retrieve(branch).catch(() => null));

    if (guessConfig) {
      console.log("Guessing config before branch reset");
      // If the `branch` already exists, we should guess against it, in case
      // there were changes made via the studio.
      if (hasBranch) {
        configContent = Object.values(
          await stainless.projects.configs.guess({
            branch,
            spec: oasContent!,
          }),
        )[0]?.content;
      } else {
        configContent = Object.values(
          await stainless.projects.configs.guess({
            branch: branchFrom,
            spec: oasContent!,
          }),
        )[0]?.content;
      }
    } else if (hasBranch) {
      console.log("Saving config before branch reset");
      configContent = Object.values(
        await stainless.projects.configs.retrieve({
          branch,
        }),
      )[0]?.content;
    } else {
      console.log("No existing branch found");
    }
  }

  console.log(`Hard resetting ${branch} and ${baseBranch} to ${branchFrom}`);
  const { config_commit } = await stainless.projects.branches.create({
    branch_from: branchFrom,
    branch: branch!,
    force: true,
  });

  console.log(`Hard reset ${branch}, now at ${config_commit.sha}`);

  const { config_commit: base_config_commit } =
    await stainless.projects.branches.create({
      branch_from: branchFrom,
      branch: baseBranch!,
      force: true,
    });

  console.log(`Hard reset ${baseBranch}, now at ${base_config_commit.sha}`);

  const { base, head } = await stainless.builds.compare(
    {
      base: {
        revision: {
          ...(baseOasContent && {
            "openapi.yml": {
              content: baseOasContent,
            },
          }),
          ...(baseConfigContent && {
            "openapi.stainless.yml": {
              content: baseConfigContent,
            },
          }),
        },
        branch: baseBranch,
        commit_message: commitMessage,
      },
      head: {
        revision: {
          ...(oasContent && {
            "openapi.yml": {
              content: oasContent,
            },
          }),
          ...(configContent && {
            "openapi.stainless.yml": {
              content: configContent,
            },
          }),
        },
        branch,
        commit_message: commitMessage,
      },
    },
    {
      // For very large specs, writing the config files can take a while.
      timeout: 3 * 60 * 1000,
    },
  );

  let lastBaseOutcome: Outcomes | null = null;
  let lastOutcome: Outcomes | null = null;
  let lastDocumentedSpec: string | null = null;

  for await (const { index, value } of combineAsyncIterators(
    pollBuild({ stainless, build: base, label: "base" }),
    pollBuild({ stainless, build: head, label: "head" }),
  )) {
    if (index === 0) {
      lastBaseOutcome = value.outcomes;
    } else {
      lastOutcome = value.outcomes;
      lastDocumentedSpec = value.documentedSpec;
    }

    if (lastOutcome) {
      yield {
        baseOutcomes: lastBaseOutcome,
        outcomes: lastOutcome,
        documentedSpec: lastDocumentedSpec,
      };
    }
  }

  return;
}

const combineAsyncIterators = async function* <T>(
  ...args: AsyncIterable<T>[]
): AsyncGenerator<{ index: number; value: T }> {
  const iters = Array.from(args, (o) => o[Symbol.asyncIterator]());
  let count = iters.length;
  const never = new Promise<never>(() => {
    // never resolve
  });

  const next = (iter: AsyncIterator<T>, index: number) =>
    iter.next().then((result) => ({ index, result }));
  const results = iters.map(next);

  while (count) {
    const { index, result } = await Promise.race(results);
    if (result.done) {
      results[index] = never;
      count--;
    } else {
      results[index] = next(iters[index], index);
      yield { index, value: result.value };
    }
  }
};

async function* pollBuild({
  stainless,
  build,
  label,
  pollingIntervalSeconds = POLLING_INTERVAL_SECONDS,
  maxPollingSeconds = MAX_POLLING_SECONDS,
}: {
  stainless: Stainless;
  build: Build;
  label: "base" | "head";
  pollingIntervalSeconds?: number;
  maxPollingSeconds?: number;
}): AsyncGenerator<{
  outcomes: Outcomes;
  documentedSpec: string | null;
}> {
  let documentedSpec: string | null = null;

  const buildId = build.id;
  const languages = Object.keys(build.targets) as Array<
    keyof typeof build.targets
  >;
  const outcomes: Outcomes = Object.fromEntries(
    languages.map((lang) => [
      lang,
      { ...build.targets[lang]!, commit: null, diagnostics: [] },
    ]),
  );

  if (buildId) {
    console.log(
      `[${label}] Created build ${buildId} against ${
        build.config_commit
      } for languages: ${languages.join(", ")}`,
    );
  } else {
    console.log(`No new build was created; exiting.`);
    yield { outcomes, documentedSpec };
    return;
  }

  const pollingStart = Date.now();
  while (
    Object.values(outcomes).filter(({ status }) => status === "completed")
      .length < languages.length &&
    Date.now() - pollingStart < maxPollingSeconds * 1000
  ) {
    let hasChange = false;
    const build = await stainless.builds.retrieve(buildId);

    for (const language of languages) {
      const existing = outcomes[language]!;
      const buildOutput = build.targets[language]!;

      outcomes[language] = {
        ...buildOutput,
        commit: existing.commit,
        diagnostics: existing.diagnostics,
      };

      if (!existing?.status || existing.status !== buildOutput.status) {
        hasChange = true;
        console.log(
          `[${label}] Build for ${language} has status ${buildOutput.status}`,
        );
      }

      // Also has a change if any of the checks have changed:
      for (const step of ["build", "lint", "test"] as const) {
        if (
          !existing?.[step] ||
          existing[step]?.status !== buildOutput[step]?.status
        ) {
          hasChange = true;
        }
      }

      if (
        existing?.commit?.status !== "completed" &&
        buildOutput.commit.status === "completed"
      ) {
        console.log(
          `[${label}] Build for ${language} has output:`,
          JSON.stringify(buildOutput),
        );

        // This is the only time we modify `commit` and `diagnostics`.
        outcomes[language].commit = buildOutput.commit;
        outcomes[language].diagnostics = [];

        try {
          for await (const diagnostic of stainless.builds.diagnostics.list(
            buildId,
            { targets: [language] },
          )) {
            outcomes[language].diagnostics.push(diagnostic);
          }
        } catch (e) {
          console.error(
            `[${label}] Error getting diagnostics, continuing anyway`,
            e,
          );
        }
      }
    }

    if (!documentedSpec && build.documented_spec) {
      hasChange = true;
      documentedSpec = await Stainless.unwrapFile(build.documented_spec);
    }

    if (hasChange) {
      yield { outcomes, documentedSpec };
    }

    // wait a bit before polling again
    await new Promise((resolve) =>
      setTimeout(resolve, pollingIntervalSeconds * 1000),
    );
  }

  const languagesWithoutOutcome = languages.filter(
    (language) =>
      !outcomes[language] || outcomes[language].commit?.status !== "completed",
  );
  for (const language of languagesWithoutOutcome) {
    console.log(
      `[${label}] Build for ${language} timed out after ${maxPollingSeconds} seconds`,
    );
    outcomes[language] = {
      object: "build_target",
      status: "completed",
      lint: {
        status: "not_started",
      },
      test: {
        status: "not_started",
      },
      commit: {
        status: "completed",
        completed: {
          conclusion: "timed_out",
          commit: null,
          merge_conflict_pr: null,
        },
      },
      diagnostics: [],
      install_url: null,
      ...(outcomes[language] as Outcomes[string] | undefined),
    };
  }

  return { outcomes, documentedSpec };
}

export function checkResults({
  outcomes,
  failRunOn,
}: {
  outcomes: Outcomes;
  failRunOn: string;
}) {
  if (failRunOn === "never") {
    return true;
  }

  const failedLanguages = Object.entries(outcomes).filter(([, outcome]) => {
    if (!outcome.commit) {
      return true;
    }
    if (
      failRunOn === "error" ||
      failRunOn === "warning" ||
      failRunOn === "note"
    ) {
      if (
        outcome.commit.completed.conclusion === "error" ||
        outcome.commit.completed.conclusion === "fatal" ||
        outcome.commit.completed.conclusion === "timed_out"
      ) {
        return true;
      }
    }
    if (failRunOn === "warning" || failRunOn === "note") {
      if (outcome.commit.completed.conclusion === "warning") return true;
    }
    if (failRunOn === "note") {
      if (outcome.commit.completed.conclusion === "note") return true;
    }
    return false;
  });

  if (failedLanguages.length > 0) {
    console.log(
      `The following languages did not build successfully: ${failedLanguages
        .map(([lang]) => lang)
        .join(", ")}`,
    );
    return false;
  }

  return true;
}
