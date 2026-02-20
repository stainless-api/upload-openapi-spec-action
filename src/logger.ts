/**
 * Logging for GitHub Actions and GitLab CI with log levels, context prefixes,
 * collapsible groups, and color output.
 */

import { getInput } from "./compat/input";
import { logging, type Logging } from "./compat/logging";

export type LogLevel = "debug" | "info" | "warn" | "error" | "off";

type LogFn = (message: string, ...args: unknown[]) => void;

interface Logger {
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
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

const LABEL_WIDTH = 5;

const LOG_LEVEL_CHOICES = ["debug", "info", "warn", "error", "off"] as const;

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

type LogContext = {
  context?: string;
  minLevel: number;
  provider: Logging;
};

function createLogFn(
  level: Exclude<LogLevel, "off">,
  { context, minLevel, provider }: LogContext,
): LogFn {
  if (LOG_LEVELS[level] < minLevel) {
    return () => {};
  }

  return (message: string, ...args: unknown[]) => {
    const extra = formatArgs(args);
    const line = [
      `${COLORS.dim}${formatTimestamp()}${COLORS.reset}`,
      `${LEVEL_COLORS[level]}${COLORS.bold}${LEVEL_LABELS[level].padEnd(LABEL_WIDTH)}${COLORS.reset}`,
      context ? `${COLORS.magenta}[${context}]${COLORS.reset}` : null,
      message,
      extra || null,
    ]
      .filter(Boolean)
      .join(" ");

    const stream =
      level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(line + "\n");

    if (level === "error") {
      provider.emitErrorAnnotation(message + (extra ? " " + extra : ""));
    }
  };
}

const BUG_REPORT_URL =
  "https://github.com/stainless-api/upload-openapi-spec-action/issues";

function createLoggerImpl(logContext: LogContext): Logger {
  const { provider } = logContext;
  const errorFn = createLogFn("error", logContext);
  const groupStack: string[] = [];

  return {
    debug: createLogFn("debug", logContext),
    info: createLogFn("info", logContext),
    warn: createLogFn("warn", logContext),
    error: errorFn,

    fatal(message: string, ...args: unknown[]): void {
      errorFn(message, ...args);
      process.stderr.write(
        `\nThis is a bug. Please report it at ${BUG_REPORT_URL}\n`,
      );
    },

    child(childContext: string): Logger {
      const { context, ...rest } = logContext;
      const newContext = context ? `${context}:${childContext}` : childContext;
      return createLoggerImpl({ context: newContext, ...rest });
    },

    group(name: string): void {
      const id = provider.startGroup(name);
      groupStack.push(id);
    },

    groupEnd(): void {
      const id = groupStack.pop();
      if (id !== undefined) {
        provider.endGroup(id);
      }
    },

    withGroup<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
      const id = provider.startGroup(name);
      try {
        const result = fn();
        if (result instanceof Promise) {
          return result.finally(() => provider.endGroup(id)) as Promise<T>;
        }
        provider.endGroup(id);
        return result;
      } catch (e) {
        provider.endGroup(id);
        throw e;
      }
    },
  };
}

export function createLogger(
  options: {
    level?: LogLevel;
  } = {},
): Logger {
  const minLevel =
    LOG_LEVELS[
      options.level ??
        getInput("log_level", { choices: LOG_LEVEL_CHOICES }) ??
        "info"
    ];
  const provider = logging();
  return createLoggerImpl({ minLevel, provider });
}

export const logger: Logger = createLogger();
