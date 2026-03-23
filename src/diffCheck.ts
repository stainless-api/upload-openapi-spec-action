import { Stainless } from "@stainless-api/sdk";
import { logger } from "./logger";
import type { Outcomes } from "./outcomes";

export async function isOnlyStatsChanged({
  stainless,
  outcomes,
  baseOutcomes,
  headBuildId,
}: {
  stainless: Stainless;
  outcomes: Outcomes;
  baseOutcomes: Outcomes;
  headBuildId: string;
}): Promise<boolean> {
  for (const lang of Object.keys(baseOutcomes)) {
    if (!(lang in outcomes)) {
      return false;
    }
  }

  for (const [lang, head] of Object.entries(outcomes)) {
    if (!(lang in baseOutcomes)) {
      return false;
    }
    const base = baseOutcomes[lang]!;

    const headConclusion = head.commit?.conclusion;
    if (headConclusion === "noop") {
      continue;
    }

    if (!base.commit?.completed?.commit || !head.commit?.completed?.commit) {
      return false;
    }

    const baseSha = base.commit.completed.commit.sha;
    const headSha = head.commit.completed.commit.sha;
    const { owner, name } = head.commit.completed.commit.repo;

    let token: string;
    try {
      const output = await stainless.builds.targetOutputs.retrieve({
        build_id: headBuildId,
        target: lang as Stainless.Target,
        type: "source",
        output: "git",
      });
      if (output.output !== "git") {
        logger.debug(
          `targetOutputs for ${lang} returned non-git output, skipping stats check`,
        );
        return false;
      }
      token = output.token;
    } catch (e) {
      logger.debug(
        `Could not get git access for ${lang}, skipping stats check`,
        e,
      );
      return false;
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${name}/compare/${baseSha}...${headSha}`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!response.ok) {
        logger.debug(
          `GitHub compare API returned ${response.status} for ${lang}, skipping stats check`,
        );
        return false;
      }

      const data = (await response.json()) as {
        status: string;
        files?: Array<{ filename: string }>;
      };

      const files = data.files ?? [];
      if (!files.every((f) => f.filename === ".stats.yml")) {
        return false;
      }
    } catch (e) {
      logger.debug(
        `Error comparing commits for ${lang}, skipping stats check`,
        e,
      );
      return false;
    }
  }

  return true;
}
