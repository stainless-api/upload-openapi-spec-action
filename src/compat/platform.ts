/**
 * Platform implementations for GitHub Actions and GitLab CI logging.
 */

import { getProvider } from "./provider";

export interface Platform {
  emitErrorAnnotation?(message: string): void;
  startGroup(name: string): string;
  endGroup(id: string): void;
}

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
} as const;

export const githubPlatform: Platform = {
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

let gitlabSectionCounter = 0;

export const gitlabPlatform: Platform = {
  startGroup(name: string) {
    const id = `section_${++gitlabSectionCounter}`;
    const ts = Math.floor(Date.now() / 1000);
    process.stdout.write(
      `\x1b[0Ksection_start:${ts}:${id}\r\x1b[0K${COLORS.bold}${name}${COLORS.reset}\n`,
    );
    return id;
  },
  endGroup(id: string) {
    const ts = Math.floor(Date.now() / 1000);
    process.stdout.write(`\x1b[0Ksection_end:${ts}:${id}\r\x1b[0K`);
  },
};

export function detectPlatform(): Platform {
  return getProvider() === "gitlab" ? gitlabPlatform : githubPlatform;
}
