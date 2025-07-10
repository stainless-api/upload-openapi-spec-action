import * as exec from "@actions/exec";
import * as fs from "node:fs";

export type Config = {
  oas?: string;
  oasHash?: string;
  config?: string;
  configHash?: string;
};

function getConfigTag(sha: string) {
  return `stainless-generated-config-from-${sha}`;
}

/**
 * Sometimes the spec and config files aren't checked in to git, e.g. if they're
 * generated via a build step. We commit these files and tag them, so later
 * actions of the workflow can use them.
 */
export async function saveConfig({
  oasPath,
  configPath,
}: {
  oasPath?: string;
  configPath?: string;
}) {
  let savedOAS = false;
  let savedConfig = false;
  let savedSha: string | null = null;
  const hasChanges =
    (
      await exec.getExecOutput(
        "git",
        ["status", "--porcelain", "--untracked-files=all"],
        { silent: true },
      )
    ).stdout !== "";

  if (!hasChanges) {
    return { savedOAS, savedConfig, savedSha };
  }

  if (oasPath && fs.existsSync(oasPath)) {
    savedOAS = true;
    await exec.exec("git", ["add", oasPath], { silent: true });
  }

  if (configPath && fs.existsSync(configPath)) {
    savedConfig = true;
    await exec.exec("git", ["add", configPath], { silent: true });
  }

  if (savedOAS || savedConfig) {
    savedSha = (
      await exec.getExecOutput("git", ["rev-parse", "HEAD"], { silent: true })
    ).stdout.trim();
    const tag = getConfigTag(savedSha);
    console.log("Saving generated config to", tag);

    // Don't commit any files other than the OAS and config:
    await exec.exec("git", ["restore", "."], { silent: true });

    // Need a name and email to commit:
    await exec.exec("git", ["config", "user.name", "stainless-app[bot]"], {
      silent: true,
    });
    await exec.exec(
      "git",
      [
        "config",
        "user.email",
        "142633134+stainless-app[bot]@users.noreply.github.com",
      ],
      { silent: true },
    );

    await exec.exec(
      "git",
      ["commit", "--allow-empty", "-m", "Save generated config"],
      { silent: true },
    );
    await exec.exec("git", ["tag", tag], { silent: true });
  }

  return { savedOAS, savedConfig, savedSha };
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
  console.log("Reading config at", sha);

  const results: Config = {};

  for (const ref of [sha, getConfigTag(sha)]) {
    try {
      await exec.exec("git", ["fetch", "--depth=1", "origin", sha], {
        silent: true,
      });
    } catch {
      // ignore; it's the next command whose failure we care about
    }
    try {
      await exec.exec("git", ["checkout", ref], { silent: true });
    } catch {
      console.log("Could not checkout", ref);
      break;
    }

    if (!results.oas && oasPath && fs.existsSync(oasPath)) {
      results.oas = fs.readFileSync(oasPath, "utf-8");
      results.oasHash = (
        await exec.getExecOutput("md5sum", [oasPath], { silent: true })
      ).stdout.split(" ")[0];
      console.log("Using OAS at", ref, "hash", results.oasHash);
    }

    if (!results.config && configPath && fs.existsSync(configPath)) {
      results.config = fs.readFileSync(configPath, "utf-8");
      results.configHash = (
        await exec.getExecOutput("md5sum", [configPath], { silent: true })
      ).stdout.split(" ")[0];
      console.log("Using config at", ref, "hash", results.configHash);
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
  await exec.exec("git", ["fetch", "--depth=1", "origin", baseSha], {
    silent: true,
  });

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
