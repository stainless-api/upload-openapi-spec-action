import type { Logging } from "../logging";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
} as const;

export function getGitLabLogging(): Logging {
  let gitlabSectionCounter = 0;

  return {
    emitErrorAnnotation() {},
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
}
