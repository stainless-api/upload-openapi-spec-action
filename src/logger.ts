import * as util from "node:util";
import { endGroupStr, getInput, startGroupStr } from "./compat";

type LogFn = (message: string, obj?: unknown) => void;
type Logger = {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
};
type LogLevel = "off" | "error" | "warn" | "info" | "debug";

const levelNumbers = {
  off: 0,
  error: 200,
  warn: 300,
  info: 400,
  debug: 500,
};

// We don't use chalk because it doesn't correctly detect that GitHub actions
// supports color.
const levelStrs = {
  off: "\u001B[90moff  \u001B[39m",
  error: "\u001B[31merror\u001B[39m",
  warn: "\u001B[33mwarn \u001B[39m",
  info: "\u001B[34minfo \u001B[39m",
  debug: "\u001B[90mdebug\u001B[39m",
};

// Should we expand objects in the log?
const levelShouldExpand = {
  off: false,
  error: true,
  warn: true,
  info: false,
  debug: false,
};

function noop() {}

function log(level: LogLevel, msg: string, arg?: unknown) {
  let obj = {};
  if (arg && typeof arg === "object") {
    obj = arg;
  } else if (arg) {
    msg = `${msg} ${arg}`;
  }

  const now = new Date();
  const msgStr = [
    "\u001B[90m[",
    now.getHours().toString().padStart(2, "0"),
    ":",
    now.getMinutes().toString().padStart(2, "0"),
    ":",
    now.getSeconds().toString().padStart(2, "0"),
    ".",
    now.getMilliseconds().toString().padStart(3, "0"),
    "]\u001B[39m ",
    levelStrs[level],
    " ",
    msg,
  ].join("");

  const msgLines = Object.entries(obj).flatMap(([key, value]) => {
    const lines = util
      .inspect(value, { colors: true, compact: false, depth: null })
      // Avoid printing the escape character on escaped backslashes.
      .replace(/\\\\/gi, "\\")
      // Add indents before each non-first line.
      .split("\n")
      .map((line, i) => (i === 0 ? line : "  " + line));
    const keyStr = `\u001B[35m${key}\u001B[39m`;
    if (lines.length > 0) {
      lines[0] = `  ${keyStr}:${lines[0].startsWith("\n") ? "" : " "}${lines[0]}`;
    }
    return lines;
  });

  if (msgLines.length > 0 && levelShouldExpand[level]) {
    // This makes it collapsible in logging.
    msgLines.unshift(startGroupStr("obj", msgStr));
    msgLines.push(endGroupStr("obj"));
  } else {
    msgLines.unshift(msgStr);
  }

  // All logging should be in stdout, because GitHub actions mix up stderr and
  // stdout. GitLab wants process.stdout.write anyway.
  process.stdout.write(msgLines.join("\n"));
}

function makeLogFn(level: keyof Logger, maxLevel: LogLevel) {
  if (levelNumbers[level] > levelNumbers[maxLevel]) {
    return noop;
  }
  return log.bind(null, level);
}

function getLogger(): Logger {
  const maybeLogLevel = getInput("log_level", { required: false });

  const [level, shouldWarn] = (() => {
    if (!maybeLogLevel) {
      return ["info" as const, false];
    }
    if (maybeLogLevel in levelNumbers) {
      return [maybeLogLevel as LogLevel, false];
    }
    return ["info" as const, true];
  })();

  const logger = {
    error: makeLogFn("error", level),
    warn: makeLogFn("warn", level),
    info: makeLogFn("info", level),
    debug: makeLogFn("debug", level),
  };

  if (shouldWarn) {
    logger.warn(
      `got log level ${maybeLogLevel}, expected one of ${Object.keys(levelNumbers)}`,
    );
  }

  return logger;
}

export const logger = getLogger();
