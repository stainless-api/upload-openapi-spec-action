import spawn from "nano-spawn";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { logger } from "./logger";

export type Config = {
  oas?: string;
  oasHash?: string;
  config?: string;
  configHash?: string;
};

function getSavedFilePath(file: string, sha: string, extension: string) {
  return path.join(
    tmpdir(),
    "stainless-generated-config",
    `${file}-${sha}${extension}`,
  );
}

/**
 * Sometimes the spec and config files aren't checked in to git, e.g. if they're
 * generated via a build step. We move these files to a fixed location, so that
 * later invocations of the action can read them.
 */
export async function saveConfig({
  oasPath,
  configPath,
}: {
  oasPath?: string;
  configPath?: string;
}) {
  let hasOAS = false;
  let hasConfig = false;

  const savedSha = (await spawn("git", ["rev-parse", "HEAD"])).stdout.trim();
  if (!savedSha) {
    throw new Error("Unable to determine current SHA; is there a git repo?");
  }
  logger.info("Saving generated config for", savedSha);

  if (oasPath && fs.existsSync(oasPath)) {
    hasOAS = true;
    const savedFilePath = getSavedFilePath(
      "oas",
      savedSha,
      path.extname(oasPath),
    );
    fs.mkdirSync(path.dirname(savedFilePath), { recursive: true });
    fs.copyFileSync(oasPath, savedFilePath);
    fs.rmSync(oasPath);
  }

  if (configPath && fs.existsSync(configPath)) {
    hasConfig = true;
    const savedFilePath = getSavedFilePath(
      "config",
      savedSha,
      path.extname(configPath),
    );
    fs.mkdirSync(path.dirname(savedFilePath), { recursive: true });
    fs.copyFileSync(configPath, savedFilePath);
    fs.rmSync(configPath);
  }

  return { hasOAS, hasConfig, savedSha };
}

/**
 * Spec and config files can either exist checked-in at the given SHA, or it
 * might have been saved by `saveConfig`; this handles reading both.
 */
export async function readConfig({
  oasPath,
  configPath,
  sha,
  required = false,
}: {
  oasPath?: string;
  configPath?: string;
  sha?: string;
  required?: boolean;
}): Promise<Config> {
  sha ??= (await spawn("git", ["rev-parse", "HEAD"])).stdout;
  if (!sha) {
    throw new Error("Unable to determine current SHA; is there a git repo?");
  }
  logger.info("Reading config at SHA", sha);

  const results: Config = {};

  const addToResults = async (
    file: "oas" | "config",
    filePath: string | undefined,
    via: string,
  ) => {
    if (results[file]) {
      return;
    }
    if (!filePath || !fs.existsSync(filePath)) {
      logger.debug(`Skipping missing ${file} at ${filePath}`);
      return;
    }
    results[file] = fs.readFileSync(filePath, "utf-8");
    results[`${file}Hash`] = (await spawn("md5sum", [filePath])).stdout.split(
      " ",
    )[0];
    logger.info(`Using ${file} via ${via}`, { hash: results[`${file}Hash`] });
  };

  try {
    await spawn("git", ["fetch", "--depth=1", "origin", sha]).catch(() => null);
    await spawn("git", ["checkout", sha, "--", "."]);
  } catch {
    logger.debug("Could not checkout", sha);
  }

  await addToResults("oas", oasPath, `git ${sha}`);
  await addToResults("config", configPath, `git ${sha}`);

  try {
    await addToResults(
      "oas",
      getSavedFilePath("oas", sha, path.extname(oasPath ?? "")),
      `saved ${sha}`,
    );
    await addToResults(
      "config",
      getSavedFilePath("config", sha, path.extname(configPath ?? "")),
      `saved ${sha}`,
    );
  } catch {
    logger.debug("Could not get config from saved file path");
  }

  if (required) {
    if (oasPath && !results.oas) {
      throw new Error(`Missing OpenAPI spec at ${oasPath} for ${sha}`);
    }
    if (configPath && !results.config) {
      throw new Error(`Missing config at ${configPath} for ${sha}`);
    }
  }

  return results;
}

export async function getMergeBase({
  baseSha,
  headSha,
}: {
  baseSha: string;
  headSha: string;
}) {
  // Fetch both base and head refs to ensure they're available locally
  try {
    await spawn("git", ["fetch", "--depth=1", "origin", baseSha, headSha]);
  } catch {
    throw new Error(
      `Cannot fetch ${baseSha} or ${headSha} from origin. Is there a git repo?`,
    );
  }

  let mergeBaseSha: string | undefined;

  // First, try to find merge-base with current shallow clone
  try {
    const output = await spawn("git", ["merge-base", headSha, baseSha]);
    mergeBaseSha = output.stdout.trim();
  } catch {
    // Expected to fail with shallow clones
  }

  // Progressively deepen the clone until we find the merge base
  // Use larger increments for efficiency (recommended by git documentation)
  // Total: 50 + 100 + 200 + 400 = 750 commits before unshallow
  const deepenAmounts = [50, 100, 200, 400];

  for (const deepenAmount of deepenAmounts) {
    if (mergeBaseSha) break;
    try {
      await spawn("git", [
        "fetch",
        "--quiet",
        `--deepen=${deepenAmount}`,
        "origin",
      ]);
    } catch {
      // ignore deepen failures (e.g., already have full history)
    }

    try {
      const output = await spawn("git", ["merge-base", headSha, baseSha]);
      mergeBaseSha = output.stdout.trim();
      if (mergeBaseSha) break;
    } catch {
      // continue deepening
    }
  }

  // Last resort: fetch the full history (unshallow)
  if (!mergeBaseSha) {
    console.log("Deepening did not find merge base, trying unshallow fetch...");
    try {
      await spawn("git", ["fetch", "--quiet", "--unshallow", "origin"]);
    } catch {
      // May fail if already unshallow, which is fine
    }

    try {
      const output = await spawn("git", ["merge-base", headSha, baseSha]);
      mergeBaseSha = output.stdout.trim();
    } catch {
      // Will fall through to error below
    }
  }

  if (!mergeBaseSha) {
    throw new Error(
      `Could not determine merge base SHA between ${headSha} and ${baseSha}. ` +
        `This may happen if the branches have completely diverged or if there is insufficient git history. ` +
        `Try using 'fetch-depth: 0' in your checkout step.`,
    );
  }

  logger.debug(`Merge base: ${mergeBaseSha}`);

  return { mergeBaseSha };
}

export async function getNonMainBaseRef({
  baseRef,
  defaultBranch,
}: {
  baseRef: string;
  defaultBranch: string;
}) {
  let nonMainBaseRef: string | undefined;

  if (baseRef !== defaultBranch) {
    nonMainBaseRef = `preview/${baseRef}`;
    logger.debug(`Non-main base ref: ${nonMainBaseRef}`);
  }

  return { nonMainBaseRef };
}

export async function isConfigChanged({
  before,
  after,
}: {
  before: Config;
  after: Config;
}): Promise<boolean> {
  let changed = false;

  if (before.oasHash !== after.oasHash) {
    logger.debug("OAS file changed");
    changed = true;
  }

  if (before.configHash !== after.configHash) {
    logger.debug("Config file changed");
    changed = true;
  }

  return changed;
}
