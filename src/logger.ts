/**
 * Logging for GitHub Actions and GitLab CI with log levels, context prefixes,
 * collapsible groups, and color output.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "off";

type LogFn = (message: string, ...args: unknown[]) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  fatal: LogFn;
  child(context: string): Logger;
  group(name: string): void;
  groupEnd(): void;
  withGroup<T>(name: string, fn: () => T): T;
  withGroup<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

export interface Platform {
  emitErrorAnnotation?(message: string): void;
  startGroup(name: string): string;
  endGroup(id: string): void;
}

export interface LoggerOptions {
  platform: Platform;
  level?: LogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  off: 4,
};

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
} as const;

const LEVEL_COLORS: Record<Exclude<LogLevel, "off">, string> = {
  debug: COLORS.cyan,
  info: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
};

const LEVEL_LABELS: Record<Exclude<LogLevel, "off">, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

function getLogLevelFromEnv(): LogLevel {
  const value = (
    process.env["LOG_LEVEL"] || process.env["INPUT_LOG_LEVEL"]
  )?.toLowerCase();
  return value && value in LOG_LEVELS ? (value as LogLevel) : "info";
}

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return "";
  return args
    .map((arg) => {
      if (arg === null) return "null";
      if (arg === undefined) return "undefined";
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.stack || arg.message;
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function createLogFn(
  level: Exclude<LogLevel, "off">,
  minLevel: number,
  platform: Platform,
  context?: string,
): LogFn {
  if (LOG_LEVELS[level] < minLevel) {
    return () => {};
  }

  return (message: string, ...args: unknown[]) => {
    const extra = formatArgs(args);
    const line = [
      `${COLORS.dim}${formatTimestamp()}${COLORS.reset}`,
      `${LEVEL_COLORS[level]}${COLORS.bold}${LEVEL_LABELS[level]}${COLORS.reset}`,
      context ? `${COLORS.magenta}[${context}]${COLORS.reset}` : null,
      message,
      extra || null,
    ]
      .filter(Boolean)
      .join(" ");

    if (level === "error" || level === "warn") {
      process.stderr.write(line + "\n");
      if (level === "error") {
        platform.emitErrorAnnotation?.(message + (extra ? " " + extra : ""));
      }
    } else {
      process.stdout.write(line + "\n");
    }
  };
}

const BUG_REPORT_URL =
  "https://github.com/stainless-api/upload-openapi-spec-action/issues";

function createLoggerImpl(
  platform: Platform,
  minLevel: number,
  context?: string,
): Logger {
  const errorFn = createLogFn("error", minLevel, platform, context);
  let activeGroupId: string | null = null;

  return {
    debug: createLogFn("debug", minLevel, platform, context),
    info: createLogFn("info", minLevel, platform, context),
    warn: createLogFn("warn", minLevel, platform, context),
    error: errorFn,

    fatal(message: string, ...args: unknown[]): void {
      errorFn(message, ...args);
      process.stderr.write(
        `\nThis is a bug. Please report it at ${BUG_REPORT_URL}\n`,
      );
    },

    child(childContext: string): Logger {
      const newContext = context ? `${context}:${childContext}` : childContext;
      return createLoggerImpl(platform, minLevel, newContext);
    },

    group(name: string): void {
      activeGroupId = platform.startGroup(name);
    },

    groupEnd(): void {
      if (activeGroupId !== null) {
        platform.endGroup(activeGroupId);
        activeGroupId = null;
      }
    },

    withGroup<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
      const id = platform.startGroup(name);
      try {
        const result = fn();
        if (result instanceof Promise) {
          return result.finally(() => platform.endGroup(id)) as Promise<T>;
        }
        platform.endGroup(id);
        return result;
      } catch (e) {
        platform.endGroup(id);
        throw e;
      }
    },
  };
}

export function createLogger(options: LoggerOptions): Logger {
  const level = options.level ?? getLogLevelFromEnv();
  return createLoggerImpl(options.platform, LOG_LEVELS[level]);
}

// Platform implementations
let gitlabSectionCounter = 0;

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

function detectPlatform(): Platform {
  return process.env["GITLAB_CI"] === "true" ? gitlabPlatform : githubPlatform;
}

export const logger: Logger = createLogger({ platform: detectPlatform() });

export function createContextLogger(context: string): Logger {
  return logger.child(context);
}
