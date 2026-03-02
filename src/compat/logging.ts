import { getGitHubLogging } from "./github/logging";
import { getGitLabLogging } from "./gitlab/logging";
import { getProvider } from "./provider";

export type Logging = {
  /** Emit an error in a platform-specific way. */
  emitErrorAnnotation: (message: string) => void;

  /** Start a logging group, returning an ID. */
  startGroup: (name: string) => string;

  /** End a logging group with the given ID. */
  endGroup: (id: string) => void;
};

let cachedLogging: Logging | undefined;

export function logging(): Logging {
  if (cachedLogging) {
    return cachedLogging;
  }
  switch (getProvider()) {
    case "github": {
      cachedLogging = getGitHubLogging();
      break;
    }
    case "gitlab": {
      cachedLogging = getGitLabLogging();
      break;
    }
  }
  return cachedLogging;
}
