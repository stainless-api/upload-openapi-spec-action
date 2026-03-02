/**
 * Compatibility layer for GitHub Actions and GitLab CI.
 */

import { logger } from "../logger";
import { getInput } from "./input";
import { getProvider } from "./provider";

export { api } from "./api";
export { ctx } from "./context";
export { getBooleanInput, getInput } from "./input";
export { logging } from "./logging";
export { setOutput } from "./output";
export { getProvider } from "./provider";

export async function getStainlessAuth(): Promise<{
  key: string;
  expiresAt: number | null;
}> {
  const apiKey = getInput("stainless_api_key", {
    required: getProvider() === "gitlab",
  });
  if (apiKey) {
    logger.debug("Authenticating with provided Stainless API key");
    return {
      key: apiKey,
      expiresAt: null,
    };
  }

  logger.debug("Authenticating with GitHub OIDC");
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;

  if (!requestUrl || !requestToken) {
    throw new Error(
      `Failed to authenticate with GitHub OIDC. Make sure your workflow has 'id-token: write' permission ` +
        `and that you have the Stainless GitHub App installed: https://www.stainless.com/docs/guides/publish/#install-the-stainless-github-app`,
    );
  }

  try {
    const response = await fetch(`${requestUrl}&audience=api.stainless.com`, {
      headers: { Authorization: `Bearer ${requestToken}` },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    if (!data.value) {
      throw new Error("No token in OIDC response");
    }
    return {
      key: data.value,
      expiresAt: Date.now() + 300 * 1000,
    };
  } catch (error) {
    throw new Error(
      `Failed to authenticate with GitHub OIDC. Make sure your workflow has 'id-token: write' permission ` +
        `and that you have the Stainless GitHub App installed: https://www.stainless.com/docs/guides/publish/#install-the-stainless-github-app. ` +
        `Error: ${error}`,
    );
  }
}
