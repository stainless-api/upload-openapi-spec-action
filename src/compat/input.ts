/**
 * Input handling for GitHub Actions and GitLab CI.
 */

export function getInput<const T extends readonly string[]>(
  name: string,
  options: { choices: T; required: true },
): T[number];
export function getInput<const T extends readonly string[]>(
  name: string,
  options: { choices: T; required?: boolean },
): T[number] | undefined;
export function getInput(
  name: string,
  options: { choices?: readonly string[]; required: true },
): string;
export function getInput(
  name: string,
  options?: { choices?: readonly string[]; required?: boolean },
): string | undefined;
export function getInput(
  name: string,
  options?: { choices?: readonly string[]; required?: boolean },
) {
  const value =
    process.env[`${name.toUpperCase()}`] ||
    process.env[`INPUT_${name.toUpperCase()}`];

  if (options?.required && !value) {
    throw new Error(`Input required and not supplied: ${name}`);
  }
  if (options?.choices && value && !options.choices.includes(value)) {
    throw new Error(
      `Input not one of the allowed choices for ${name}: ${value}`,
    );
  }
  return value || undefined;
}

export function getBooleanInput(
  name: string,
  options: { required: true },
): boolean;
export function getBooleanInput(
  name: string,
  options?: { required: boolean },
): boolean | undefined;
export function getBooleanInput(name: string, options?: { required: boolean }) {
  const value = getInput(name, options)?.toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}
