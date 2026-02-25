import { Stainless } from "@stainless-api/sdk";
import * as fs from "node:fs";
import {
  commentThrottler,
  printComment,
  retrieveComment,
  upsertComment,
} from "./comment";
import { makeCommitMessageConventional } from "./commitMessage";
import { api, setOutput } from "./compat";
import type { Config } from "./config";
import {
  getMergeBase,
  getNonMainBaseRef,
  isConfigChanged,
  readConfig,
  saveConfig,
} from "./config";
import { logger } from "./logger";
import { FailRunOn, shouldFailRun } from "./outcomes";
import type { RunResult } from "./runBuilds";
import { runBuilds } from "./runBuilds";

export interface PreviewParams {
  orgName: string;
  projectName: string;
  oasPath?: string;
  configPath?: string;
  defaultCommitMessage: string;
  guessConfig?: boolean;
  failRunOn: FailRunOn;
  makeComment: boolean;
  multipleCommitMessages?: boolean;
  baseSha: string;
  baseRef: string;
  baseBranch: string;
  defaultBranch: string;
  headSha: string;
  branch: string;
  outputDir?: string;
  prNumber: number | null;
}

export async function runPreview(
  stainless: Stainless,
  params: PreviewParams,
): Promise<void> {
  const {
    orgName,
    projectName,
    oasPath,
    configPath,
    defaultCommitMessage,
    guessConfig,
    failRunOn,
    makeComment,
    baseSha,
    baseRef,
    baseBranch,
    defaultBranch,
    headSha,
    branch,
    outputDir,
    prNumber,
  } = params;
  let { multipleCommitMessages } = params;

  if (!prNumber) {
    throw new Error("This action must be run from a pull request.");
  }

  if (makeComment && api({ optional: true }) === null) {
    throw new Error("This action requires an API token to make a comment.");
  }

  // If we came from the checkout-pr-ref action, we might need to save the
  // generated config files.
  const { savedSha } = await saveConfig({
    oasPath,
    configPath,
  });
  if (savedSha !== null && savedSha !== headSha) {
    logger.warn(
      `Expected HEAD to be ${headSha}, but was ${savedSha}. This might cause issues with getting the head revision.`,
    );
  }

  const enableAiCommitMessages = await stainless.orgs
    .retrieve(orgName)
    .then((org) => org.enable_ai_commit_messages)
    .catch((err) => {
      logger.warn(`Could not fetch data for ${orgName}.`, err);
      return false;
    });
  if (enableAiCommitMessages) {
    if (multipleCommitMessages === false) {
      logger.warn(
        'AI commit messages are enabled, but "multiple_commit_messages" is set to false. Overriding to true.',
      );
    } else if (multipleCommitMessages === undefined) {
      logger.info(
        'AI commit messages are enabled; setting "multiple_commit_messages" to true.',
      );
    }
    multipleCommitMessages = true;
  }

  logger.group("Getting parent revision");

  const { mergeBaseSha } = await getMergeBase({ baseSha, headSha });
  const { nonMainBaseRef } = await getNonMainBaseRef({
    baseRef,
    defaultBranch,
  });

  const mergeBaseConfig = await readConfig({
    oasPath,
    configPath,
    sha: mergeBaseSha,
  });
  const headConfig = await readConfig({
    oasPath,
    configPath,
    sha: headSha,
    required: true,
  });

  const configChanged = await isConfigChanged({
    before: mergeBaseConfig,
    after: headConfig,
  });

  if (!configChanged) {
    logger.info("No config files changed, skipping preview");

    // In this case, we only want to make a comment if there's an existing
    // comment---which can happen if the changes introduced by the PR
    // disappear for some reason.
    if (makeComment) {
      logger.group("Updating comment");

      const commentBody = printComment({ noChanges: true });

      await upsertComment(prNumber, {
        body: commentBody,
        skipCreate: true,
      });

      logger.groupEnd();
    }

    return;
  }

  const branchFrom = await computeBranchFrom({
    stainless,
    projectName,
    mergeBaseConfig,
    nonMainBaseRef,
    oasPath,
    configPath,
  });

  logger.groupEnd();

  const initialComment = makeComment ? await retrieveComment(prNumber) : null;
  let commitMessage =
    initialComment?.commitMessage ??
    makeCommitMessageConventional(defaultCommitMessage);
  let targetCommitMessages = multipleCommitMessages
    ? (initialComment?.targetCommitMessages ?? {})
    : undefined;

  if (targetCommitMessages) {
    logger.info("Using commit messages:", targetCommitMessages);
    logger.info("With default commit message:", commitMessage);
  } else {
    logger.info("Using commit message:", commitMessage);
  }

  // For now, let's set this true only if this is our first-ever run (so there wouldn't be a pre-existing comment).
  // In the future, we'll want to trigger this for *every* run until a user has manually edited the comment.
  const shouldGenerateAiCommitMessages =
    enableAiCommitMessages &&
    Object.keys(targetCommitMessages ?? {}).length === 0;

  const generator = runBuilds({
    stainless,
    oasContent: headConfig.oas,
    configContent: headConfig.config,
    baseOasContent: mergeBaseConfig.oas,
    baseConfigContent: mergeBaseConfig.config,
    projectName,
    branchFrom,
    baseBranch,
    branch,
    guessConfig: guessConfig ?? (!configPath && !!oasPath),
    commitMessage,
    targetCommitMessages,
  });

  let latestRun: RunResult | null = null;
  const upsert = commentThrottler(prNumber);

  let pendingAiCommitMessages: Set<string> | undefined;

  while (true) {
    const run = await generator.next();

    if (run.value) {
      latestRun = run.value;
    }

    if (makeComment && latestRun) {
      const { outcomes, baseOutcomes } = latestRun;

      // In case the comment was updated between polls:
      const comment = await retrieveComment(prNumber);
      commitMessage = comment?.commitMessage ?? commitMessage;
      targetCommitMessages =
        comment?.targetCommitMessages ?? targetCommitMessages;

      if (shouldGenerateAiCommitMessages) {
        if (pendingAiCommitMessages === undefined) {
          pendingAiCommitMessages = new Set();
          for (const lang of Object.keys(outcomes)) {
            pendingAiCommitMessages.add(lang);
          }
        }

        for (const lang of pendingAiCommitMessages) {
          const commit = outcomes[lang].commit?.completed?.commit;
          const baseCommit = baseOutcomes?.[lang]?.commit?.completed?.commit;

          if (!commit || !baseCommit) {
            continue;
          }

          targetCommitMessages![lang] = await stainless.projects
            .generateCommitMessage({
              project: projectName,
              target: lang as Stainless.Target,
              base_ref: baseCommit.sha,
              head_ref: commit.sha,
            })
            .then((result) => result.ai_commit_message)
            .catch((err) => {
              logger.error("Error in AI commit message generation:", err);
              return commitMessage;
            });

          pendingAiCommitMessages.delete(lang);
        }
      }

      const commentBody = printComment({
        orgName,
        projectName,
        branch,
        commitMessage,
        targetCommitMessages,
        pendingAiCommitMessages,
        outcomes,
        baseOutcomes,
      });

      await upsert({ body: commentBody, force: run.done });
    }

    if (run.done) {
      if (!latestRun) {
        throw new Error("No latest run found after build finish");
      }

      const { outcomes, baseOutcomes, documentedSpec } = latestRun!;

      setOutput("outcomes", outcomes);
      setOutput("base_outcomes", baseOutcomes);

      if (documentedSpec && outputDir) {
        const documentedSpecPath = `${outputDir}/openapi.documented.yml`;
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(documentedSpecPath, documentedSpec);
        setOutput("documented_spec_path", documentedSpecPath);
      }

      if (!shouldFailRun({ failRunOn, outcomes, baseOutcomes })) {
        process.exit(1);
      }

      break;
    }
  }
}

async function computeBranchFrom({
  stainless,
  projectName,
  mergeBaseConfig,
  nonMainBaseRef,
  oasPath,
  configPath,
}: {
  stainless: Stainless;
  projectName: string;
  mergeBaseConfig: Config;
  nonMainBaseRef?: string;
  oasPath?: string;
  configPath?: string;
}) {
  const hashes: Record<string, { hash: string }> = {};

  if (mergeBaseConfig.oasHash) {
    hashes["openapi.yml"] = { hash: mergeBaseConfig.oasHash };
  }
  if (mergeBaseConfig.configHash) {
    hashes["stainless.yml"] = { hash: mergeBaseConfig.configHash };
  }
  if (
    (oasPath && !mergeBaseConfig.oasHash) ||
    (configPath && !mergeBaseConfig.configHash)
  ) {
    // We should only use the merge base to find a revision if all of the
    // specified files have a hash. In this case, one of the paths is
    // specified but the hash isn't in the merge base, so don't use it.
  } else {
    const configCommit = (
      await stainless.builds.list({
        project: projectName,
        branch: nonMainBaseRef ?? "main",
        revision: hashes,
        limit: 1,
      })
    ).data[0]?.config_commit;

    if (configCommit) {
      logger.debug(`Found base via merge base SHA: ${configCommit}`);
      return configCommit;
    }
  }

  if (nonMainBaseRef) {
    const configCommit = (
      await stainless.builds.list({
        project: projectName,
        branch: nonMainBaseRef,
        limit: 1,
      })
    ).data[0]?.config_commit;

    if (configCommit) {
      logger.debug(`Found base via non-main base ref: ${configCommit}`);
      return configCommit;
    }
  }

  const configCommit = (
    await stainless.builds.list({
      project: projectName,
      branch: "main",
      limit: 1,
    })
  ).data[0]?.config_commit;

  if (!configCommit) {
    throw new Error("Could not determine base revision");
  }

  logger.debug(`Found base via main branch: ${configCommit}`);
  return configCommit;
}
