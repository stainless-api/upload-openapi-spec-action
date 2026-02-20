import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { logging, type Logging } from "./compat/logging";
import { createLogger, type LogLevel } from "./logger";

vi.mock("./compat/logging", async () => {
  const actual =
    await vi.importActual<typeof import("./compat/logging")>(
      "./compat/logging",
    );
  return {
    ...actual,
    logging: vi.fn(),
  };
});

describe("logger", () => {
  let stdoutSpy: Mock;
  let stderrSpy: Mock;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true) as unknown as Mock;
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true) as unknown as Mock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockProvider(): Logging & {
    calls: { method: string; args: unknown[] }[];
  } {
    const calls: { method: string; args: unknown[] }[] = [];
    return {
      calls,
      emitErrorAnnotation(message: string) {
        calls.push({ method: "emitErrorAnnotation", args: [message] });
      },
      startGroup(name: string) {
        calls.push({ method: "startGroup", args: [name] });
        return `group-${calls.length}`;
      },
      endGroup(id: string) {
        calls.push({ method: "endGroup", args: [id] });
      },
    };
  }

  function setupLogger(level: LogLevel) {
    const provider = mockProvider();
    vi.mocked(logging).mockReturnValue(provider);
    return { logger: createLogger({ level }), provider };
  }

  describe("log levels", () => {
    it("filters messages below configured level", () => {
      const { logger } = setupLogger("warn");

      logger.debug("debug message");
      logger.info("info message");
      logger.warn("warn message");
      logger.error("error message");

      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).not.toContain("debug message");
      expect(output).not.toContain("info message");
      expect(output).toContain("warn message");
      expect(output).toContain("error message");
    });

    it("logs all messages at debug level", () => {
      const { logger } = setupLogger("debug");

      logger.debug("debug message");
      logger.info("info message");

      const stdout = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(stdout).toContain("debug message");
      expect(stdout).toContain("info message");
    });

    it("logs nothing at off level", () => {
      const { logger } = setupLogger("off");

      logger.debug("debug");
      logger.info("info");
      logger.warn("warn");
      logger.error("error");

      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });

  describe("child loggers", () => {
    it("adds context prefix to messages", () => {
      const { logger } = setupLogger("info");
      const child = logger.child("build");

      child.info("starting");

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("[build]");
      expect(output).toContain("starting");
    });

    it("chains context prefixes", () => {
      const { logger } = setupLogger("info");
      const child = logger.child("build").child("typescript");

      child.info("compiling");

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("[build:typescript]");
    });
  });

  describe("provider integration", () => {
    it("calls emitErrorAnnotation on error", () => {
      const { logger, provider } = setupLogger("error");

      logger.error("something failed");

      expect(provider.calls).toContainEqual({
        method: "emitErrorAnnotation",
        args: ["something failed"],
      });
    });

    it("does not call emitErrorAnnotation on warn", () => {
      const { logger, provider } = setupLogger("warn");

      logger.warn("something warned");

      expect(provider.calls).not.toContainEqual(
        expect.objectContaining({ method: "emitErrorAnnotation" }),
      );
    });
  });

  describe("group/groupEnd", () => {
    it("calls startGroup and endGroup", () => {
      const { logger, provider } = setupLogger("info");

      logger.group("Test Group");
      logger.groupEnd();

      expect(provider.calls).toEqual([
        { method: "startGroup", args: ["Test Group"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });

    it("handles nested groups with stack", () => {
      const { logger, provider } = setupLogger("info");

      logger.group("Outer");
      logger.group("Inner");
      logger.groupEnd();
      logger.groupEnd();

      expect(provider.calls).toEqual([
        { method: "startGroup", args: ["Outer"] },
        { method: "startGroup", args: ["Inner"] },
        { method: "endGroup", args: ["group-2"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });
  });

  describe("withGroup", () => {
    it("wraps sync function in group", () => {
      const { logger, provider } = setupLogger("info");

      const result = logger.withGroup("Sync Work", () => {
        return 42;
      });

      expect(result).toBe(42);
      expect(provider.calls).toEqual([
        { method: "startGroup", args: ["Sync Work"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });

    it("wraps async function in group", async () => {
      const { logger, provider } = setupLogger("info");

      const result = await logger.withGroup("Async Work", async () => {
        return "done";
      });

      expect(result).toBe("done");
      expect(provider.calls).toEqual([
        { method: "startGroup", args: ["Async Work"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });

    it("ends group on sync error", () => {
      const { logger, provider } = setupLogger("info");

      expect(() =>
        logger.withGroup("Failing Work", () => {
          throw new Error("oops");
        }),
      ).toThrow("oops");

      expect(provider.calls).toEqual([
        { method: "startGroup", args: ["Failing Work"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });

    it("ends group on async error", async () => {
      const { logger, provider } = setupLogger("info");

      await expect(
        logger.withGroup("Failing Async", async () => {
          throw new Error("async oops");
        }),
      ).rejects.toThrow("async oops");

      expect(provider.calls).toEqual([
        { method: "startGroup", args: ["Failing Async"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });
  });

  describe("fatal", () => {
    it("logs error and bug report URL", () => {
      const { logger } = setupLogger("error");

      logger.fatal("Something broke", new Error("test error"));

      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Something broke");
      expect(output).toContain("This is a bug");
      expect(output).toContain(
        "https://github.com/stainless-api/upload-openapi-spec-action/issues",
      );
    });

    it("calls provider error annotation", () => {
      const { logger, provider } = setupLogger("error");

      logger.fatal("Fatal error occurred");

      expect(provider.calls).toContainEqual({
        method: "emitErrorAnnotation",
        args: ["Fatal error occurred"],
      });
    });
  });

  describe("argument formatting", () => {
    it("formats Error objects with stack trace", () => {
      const { logger } = setupLogger("error");
      const error = new Error("test error");

      logger.error("Failed:", error);

      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("test error");
      expect(output).toContain("Error:");
    });

    it("formats objects as JSON", () => {
      const { logger } = setupLogger("info");

      logger.info("Data:", { foo: "bar", count: 42 });

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain('"foo": "bar"');
      expect(output).toContain('"count": 42');
    });

    it("handles null and undefined", () => {
      const { logger } = setupLogger("info");

      logger.info("Values:", null, undefined);

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("null");
      expect(output).toContain("undefined");
    });
  });
});
