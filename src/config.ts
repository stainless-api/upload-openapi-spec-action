import * as exec from "@actions/exec";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

export type Config = {
  oas?: string;
  oasHash?: string;
  config?: string;
  configHash?: string;
};

function getSavedFilePath(file: string, sha: string) {
  return path.join(
    tmpdir(),
    "stainless-generated-config",
    `${file}-${sha}.yml`,
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

  const savedSha = (
    await exec.getExecOutput("git", ["rev-parse", "HEAD"], { silent: true })
  ).stdout.trim();
  if (!savedSha) {
    throw new Error("Unable to determine current SHA; is there a git repo?");
  }
  console.log("Saving generated config for", savedSha);

  if (oasPath && fs.existsSync(oasPath)) {
    hasOAS = true;
    const savedFilePath = getSavedFilePath("oas", savedSha);
    fs.mkdirSync(path.dirname(savedFilePath), { recursive: true });
    fs.copyFileSync(oasPath, savedFilePath);
  }

  if (configPath && fs.existsSync(configPath)) {
    hasConfig = true;
    const savedFilePath = getSavedFilePath("config", savedSha);
    fs.mkdirSync(path.dirname(savedFilePath), { recursive: true });
    fs.copyFileSync(configPath, savedFilePath);
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
}: {
  oasPath?: string;
  configPath?: string;
  sha?: string;
}): Promise<Config> {
  sha ??= (await exec.getExecOutput("git", ["rev-parse", "HEAD"])).stdout;
  if (!sha) {
    throw new Error("Unable to determine current SHA; is there a git repo?");
  }
  console.log("Reading config at", sha);

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
      console.log("Skipping missing", file, "at", filePath);
      return;
    }
    results[file] = fs.readFileSync(filePath, "utf-8");
    results[`${file}Hash`] = (
      await exec.getExecOutput("md5sum", [filePath], { silent: true })
    ).stdout.split(" ")[0];
    console.log(`Using ${file} via`, via, "hash", results[`${file}Hash`]);
  };

  try {
    await exec
      .exec("git", ["fetch", "--depth=1", "origin", sha], { silent: true })
      .catch(() => null);
    await exec.exec("git", ["checkout", sha], { silent: true });
  } catch {
    console.log("Could not checkout", sha);
  }

  await addToResults("oas", oasPath, `git ${sha}`);
  await addToResults("config", configPath, `git ${sha}`);

  try {
    await addToResults("oas", getSavedFilePath("oas", sha), `saved ${sha}`);
    await addToResults(
      "config",
      getSavedFilePath("config", sha),
      `saved ${sha}`,
    );
  } catch {
    console.log("Could not get config from saved file path");
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
  try {
    await exec.exec("git", ["fetch", "--depth=1", "origin", baseSha], {
      silent: true,
    });
  } catch {
    throw new Error(
      `Cannot fetch ${baseSha} from origin, is there a git repo?`,
    );
  }

  let mergeBaseSha: string | undefined;

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const output = await exec.getExecOutput(
        "git",
        ["merge-base", headSha, baseSha],
        { silent: true },
      );
      mergeBaseSha = output.stdout.trim();
      if (mergeBaseSha) break;
    } catch {
      // ignore
    }

    // deepen fetch until we find merge base
    await exec.exec(
      "git",
      ["fetch", "--quiet", "--deepen=10", "origin", baseSha, headSha],
      { silent: true },
    );
  }

  if (!mergeBaseSha) {
    throw new Error("Could not determine merge base SHA");
  }

  console.log(`Merge base: ${mergeBaseSha}`);

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
    console.log(`Non-main base ref: ${nonMainBaseRef}`);
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
    console.log("OAS file changed");
    changed = true;
  }

  if (before.configHash !== after.configHash) {
    console.log("Config file changed");
    changed = true;
  }

  return changed;
}
