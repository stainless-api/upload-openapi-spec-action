import Stainless, { ClientOptions } from "@stainless-api/sdk";
import packageJSON from "../package.json";
import { isGitLabCI } from "./compat";

export function getStainlessClient(
  action: string | undefined,
  opts: ClientOptions,
) {
  const headers: Record<string, string> = {
    "User-Agent": `Stainless/Action ${packageJSON.version}`,
  };

  if (action) {
    const actionPath = `stainless-api/upload-openapi-spec-action/${action}`;
    if (isGitLabCI()) {
      headers["X-GitLab-CI"] = actionPath;
    } else {
      headers["X-GitHub-Action"] = actionPath;
    }
  }

  return new Stainless({
    ...opts,
    defaultHeaders: {
      ...opts.defaultHeaders,
      ...headers,
    },
  });
}
