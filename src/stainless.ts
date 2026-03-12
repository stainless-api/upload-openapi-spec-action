import Stainless, { ClientOptions } from "@stainless-api/sdk";
import packageJSON from "../package.json";
import { ctx } from "./compat";
import { logger } from "./logger";

type StainlessAuth = { key: string; expiresAt: number | null };

/**
 * Creates a custom fetch that refreshes the auth token if it expires within 30 seconds.
 */
export function createAutoRefreshFetch(
  initialAuth: StainlessAuth,
  refreshAuth: () => Promise<StainlessAuth>,
): typeof fetch {
  let currentApiKey = initialAuth.key;
  let expiresAt = initialAuth.expiresAt;

  return async (input, init) => {
    if (expiresAt != null && expiresAt - Date.now() < 30 * 1000) {
      logger.info("Auth token expiring soon, refreshing...");
      const newAuth = await refreshAuth();
      currentApiKey = newAuth.key;
      expiresAt = newAuth.expiresAt;
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${currentApiKey}`);

    return fetch(input, { ...init, headers });
  };
}

/**
 * adds retries to a fetch function for 401 responses, as it seems that OIDC decode on the server can
 * occasionally fail transiently
 */
export const addFetch401Retries = (
  fetch: typeof globalThis.fetch,
  { numRetries }: { numRetries: number },
): typeof globalThis.fetch => {
  return async (input, init) => {
    let attempts = 0;
    let response;
    do {
      response = await fetch(input, init);
      if (response.status !== 401) {
        break;
      }
      attempts++;
      logger.warn("Received 401 response, retrying...");
    } while (attempts <= numRetries);
    return response;
  };
};

export function getStainlessClient(
  action: string | undefined,
  opts: ClientOptions,
) {
  const headers: Record<string, string> = {
    "User-Agent": `Stainless/Action ${packageJSON.version}`,
  };

  if (action) {
    headers["X-Stainless-Platform"] =
      ctx().provider === "gitlab" ? "gitlab-ci" : "github-actions";
    headers["X-Stainless-Action"] =
      `stainless-api/upload-openapi-spec-action/${action}`;
  }

  return new Stainless({
    ...opts,
    defaultHeaders: {
      ...opts.defaultHeaders,
      ...headers,
    },
  });
}
