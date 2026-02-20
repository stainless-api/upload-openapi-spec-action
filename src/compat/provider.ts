type Provider = "github" | "gitlab";

export function getProvider(): Provider {
  if (process.env.GITLAB_CI === "true") {
    return "gitlab";
  }
  if (process.env.GITHUB_ACTIONS === "true") {
    return "github";
  }
  // Fallback to GitHub for now.
  return "github";
}
