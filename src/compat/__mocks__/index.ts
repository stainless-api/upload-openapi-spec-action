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
    },
    prNumber: 123,
  };
}
