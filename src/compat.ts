import * as core from "@actions/core";

export function isGitLabCI(): boolean {
  return process.env["GITLAB_CI"] === "true";
}

export function getInput(name: string, options?: { required: boolean }) {
  if (isGitLabCI()) {
    const value =
      process.env[`${name.toUpperCase()}`] ||
      process.env[`INPUT_${name.toUpperCase()}`];

    if (options?.required && !value) {
      throw new Error(`Input required and not supplied: ${name}`);
    }

    return value || "";
  } else {
    return core.getInput(name, options);
  }
}

export function getBooleanInput(name: string, options?: { required: boolean }) {
  if (isGitLabCI()) {
    const value =
      process.env[`${name.toUpperCase()}`]?.toLowerCase() ||
      process.env[`INPUT_${name.toUpperCase()}`]?.toLowerCase();

    if (options?.required && value === undefined) {
      throw new Error(`Input required and not supplied: ${name}`);
    }

    return value === "true";
  } else {
    return core.getBooleanInput(name, options);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setOutput(name: string, value: any) {
  if (isGitLabCI()) {
    // We don't set outputs in GitLab CI.
  } else {
    core.setOutput(name, value);
  }
}
