import type { Logging } from "../logging";

export function getGitHubLogging(): Logging {
  return {
    emitErrorAnnotation(message: string) {
      process.stdout.write(`::error::${message}\n`);
    },
    startGroup(name: string) {
      process.stdout.write(`::group::${name}\n`);
      return "";
    },
    endGroup() {
      process.stdout.write(`::endgroup::\n`);
    },
  };
}
