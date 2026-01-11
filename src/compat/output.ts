/**
 * Output handling for GitHub Actions and GitLab CI.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { isGitLabCI } from "./platform";

export function setOutput(name: string, value: any) {
  if (isGitLabCI()) return;

  const stringified =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);

  const filePath = process.env["GITHUB_OUTPUT"];
  if (filePath && fs.existsSync(filePath)) {
    const delimiter = `ghadelimiter_${crypto.randomUUID()}`;
    fs.appendFileSync(
      filePath,
      `${name}<<${delimiter}\n${stringified}\n${delimiter}\n`,
      "utf-8",
    );
  } else {
    process.stdout.write(`\n::set-output name=${name}::${stringified}\n`);
  }
}
