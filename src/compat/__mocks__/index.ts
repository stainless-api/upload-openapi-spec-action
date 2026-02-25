import type { Context } from "../context";

export function ctx(): Context {
  return {
    provider: "github",
    host: "https://github.com",
    owner: "test-org",
    repo: "test-config-source",
    urls: {
      api: "https://api.github.com",
      run: "https://github.com/test-org/test-config-source/actions/runs/1",
    },
    names: {
      ci: "GitHub Actions",
      pr: "PR",
      provider: "GitHub",
    },
    defaultBranch: "main",
    prNumber: 123,
    refName: "test-branch",
    sha: "1234567890abcdef1234567890abcdef12345678",
  };
}
