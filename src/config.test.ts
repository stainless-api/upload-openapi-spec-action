import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getMergeBase } from "./config";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import spawn from "nano-spawn";

describe("getMergeBase", () => {
  let tempDir: string;
  let originalCwd: string;
  let defaultBranch: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), "getMergeBase-test-"));

    // Initialize a bare "remote" repo and a working repo
    const remoteDir = join(tempDir, "remote.git");
    const workDir = join(tempDir, "work");

    // Create bare remote
    await spawn("git", ["init", "--bare", remoteDir]);

    // Create working repo
    await spawn("git", ["clone", remoteDir, workDir]);
    process.chdir(workDir);

    // Configure git
    await spawn("git", ["config", "user.email", "test@test.com"]);
    await spawn("git", ["config", "user.name", "Test User"]);
    await spawn("git", ["config", "commit.gpgsign", "false"]);

    // Get the default branch name (may be 'main' or 'master' depending on git config)
    const { stdout } = await spawn("git", ["branch", "--show-current"]);
    defaultBranch = stdout.trim() || "main";
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should find merge base between two commits on same branch", async () => {
    // Create initial commit
    await spawn("git", ["commit", "--allow-empty", "-m", "initial"]);
    const { stdout: initialSha } = await spawn("git", ["rev-parse", "HEAD"]);

    // Create second commit
    await spawn("git", ["commit", "--allow-empty", "-m", "second"]);
    const { stdout: secondSha } = await spawn("git", ["rev-parse", "HEAD"]);

    // Push to remote
    await spawn("git", ["push", "-u", "origin", defaultBranch]);

    const result = await getMergeBase({
      baseSha: initialSha.trim(),
      headSha: secondSha.trim(),
    });

    expect(result.mergeBaseSha).toBe(initialSha.trim());
  });

  it("should find merge base between diverged branches", async () => {
    // Create initial commit (this will be the merge base)
    await spawn("git", ["commit", "--allow-empty", "-m", "initial"]);
    const { stdout: mergeBaseSha } = await spawn("git", ["rev-parse", "HEAD"]);

    // Push default branch
    await spawn("git", ["push", "-u", "origin", defaultBranch]);

    // Create feature branch and add commits
    await spawn("git", ["checkout", "-b", "feature"]);
    await spawn("git", ["commit", "--allow-empty", "-m", "feature-1"]);
    await spawn("git", ["commit", "--allow-empty", "-m", "feature-2"]);
    const { stdout: featureSha } = await spawn("git", ["rev-parse", "HEAD"]);
    await spawn("git", ["push", "-u", "origin", "feature"]);

    // Go back to default branch and add different commits
    await spawn("git", ["checkout", defaultBranch]);
    await spawn("git", ["commit", "--allow-empty", "-m", "default-branch-1"]);
    const { stdout: defaultBranchSha } = await spawn("git", [
      "rev-parse",
      "HEAD",
    ]);
    await spawn("git", ["push", "origin", defaultBranch]);

    const result = await getMergeBase({
      baseSha: defaultBranchSha.trim(),
      headSha: featureSha.trim(),
    });

    expect(result.mergeBaseSha).toBe(mergeBaseSha.trim());
  });

  it("should find merge base with shallow clone", async () => {
    // Create a chain of commits
    await spawn("git", ["commit", "--allow-empty", "-m", "commit-1"]);
    const { stdout: commit1 } = await spawn("git", ["rev-parse", "HEAD"]);

    await spawn("git", ["commit", "--allow-empty", "-m", "commit-2"]);
    await spawn("git", ["commit", "--allow-empty", "-m", "commit-3"]);
    await spawn("git", ["commit", "--allow-empty", "-m", "commit-4"]);
    await spawn("git", ["commit", "--allow-empty", "-m", "commit-5"]);
    const { stdout: commit5 } = await spawn("git", ["rev-parse", "HEAD"]);

    await spawn("git", ["push", "-u", "origin", defaultBranch]);

    // Create a shallow clone
    const shallowDir = join(tempDir, "shallow");
    await spawn("git", [
      "clone",
      "--depth=2",
      join(tempDir, "remote.git"),
      shallowDir,
    ]);
    process.chdir(shallowDir);

    // The shallow clone only has 2 commits, but getMergeBase should deepen to find commit-1
    const result = await getMergeBase({
      baseSha: commit1.trim(),
      headSha: commit5.trim(),
    });

    expect(result.mergeBaseSha).toBe(commit1.trim());
  });

  it("should throw error when commits are unrelated", async () => {
    // Create a commit
    await spawn("git", ["commit", "--allow-empty", "-m", "commit-1"]);
    await spawn("git", ["push", "-u", "origin", defaultBranch]);

    // Create orphan branch with unrelated history
    await spawn("git", ["checkout", "--orphan", "unrelated"]);
    await spawn("git", ["commit", "--allow-empty", "-m", "orphan-commit"]);
    const { stdout: orphanSha } = await spawn("git", ["rev-parse", "HEAD"]);
    await spawn("git", ["push", "-u", "origin", "unrelated"]);

    await spawn("git", ["checkout", defaultBranch]);
    const { stdout: defaultBranchSha } = await spawn("git", [
      "rev-parse",
      "HEAD",
    ]);

    await expect(
      getMergeBase({
        baseSha: defaultBranchSha.trim(),
        headSha: orphanSha.trim(),
      }),
    ).rejects.toThrow("Could not determine merge base SHA");
  });

  it("should throw error for non-existent ref", async () => {
    await spawn("git", ["commit", "--allow-empty", "-m", "commit-1"]);
    await spawn("git", ["push", "-u", "origin", defaultBranch]);

    await expect(
      getMergeBase({
        baseSha: "nonexistent123456",
        headSha: "HEAD",
      }),
    ).rejects.toThrow("Cannot fetch");
  });
});
