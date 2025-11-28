import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  createLogger,
  githubPlatform,
  gitlabPlatform,
  type Platform,
} from "./logger";

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

  function mockPlatform(): Platform & {
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

  describe("log levels", () => {
    it("filters messages below configured level", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "warn" });

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
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "debug" });

      logger.debug("debug message");
      logger.info("info message");

      const stdout = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(stdout).toContain("debug message");
      expect(stdout).toContain("info message");
    });

    it("logs nothing at off level", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "off" });

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
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "info" });
      const child = logger.child("build");

      child.info("starting");

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("[build]");
      expect(output).toContain("starting");
    });

    it("chains context prefixes", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "info" });
      const child = logger.child("build").child("typescript");

      child.info("compiling");

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("[build:typescript]");
    });
  });

  describe("platform integration", () => {
    it("calls emitErrorAnnotation on error", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "error" });

      logger.error("something failed");

      expect(platform.calls).toContainEqual({
        method: "emitErrorAnnotation",
        args: ["something failed"],
      });
    });

    it("does not call emitErrorAnnotation on warn", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "warn" });

      logger.warn("something warned");

      expect(platform.calls).not.toContainEqual(
        expect.objectContaining({ method: "emitErrorAnnotation" }),
      );
    });

    it("calls startGroup and endGroup", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "info" });

      logger.group("Test Group");
      logger.groupEnd();

      expect(platform.calls).toEqual([
        { method: "startGroup", args: ["Test Group"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });
  });

  describe("withGroup", () => {
    it("wraps sync function in group", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "info" });

      const result = logger.withGroup("Sync Work", () => {
        return 42;
      });

      expect(result).toBe(42);
      expect(platform.calls).toEqual([
        { method: "startGroup", args: ["Sync Work"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });

    it("wraps async function in group", async () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "info" });

      const result = await logger.withGroup("Async Work", async () => {
        return "done";
      });

      expect(result).toBe("done");
      expect(platform.calls).toEqual([
        { method: "startGroup", args: ["Async Work"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });

    it("ends group on sync error", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "info" });

      expect(() =>
        logger.withGroup("Failing Work", () => {
          throw new Error("oops");
        }),
      ).toThrow("oops");

      expect(platform.calls).toEqual([
        { method: "startGroup", args: ["Failing Work"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });

    it("ends group on async error", async () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "info" });

      await expect(
        logger.withGroup("Failing Async", async () => {
          throw new Error("async oops");
        }),
      ).rejects.toThrow("async oops");

      expect(platform.calls).toEqual([
        { method: "startGroup", args: ["Failing Async"] },
        { method: "endGroup", args: ["group-1"] },
      ]);
    });
  });

  describe("fatal", () => {
    it("logs error and bug report URL", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "error" });

      logger.fatal("Something broke", new Error("test error"));

      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Something broke");
      expect(output).toContain("This is a bug");
      expect(output).toContain(
        "https://github.com/stainless-api/upload-openapi-spec-action/issues",
      );
    });

    it("calls platform error annotation", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "error" });

      logger.fatal("Fatal error occurred");

      expect(platform.calls).toContainEqual({
        method: "emitErrorAnnotation",
        args: ["Fatal error occurred"],
      });
    });
  });

  describe("argument formatting", () => {
    it("formats Error objects with stack trace", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "error" });
      const error = new Error("test error");

      logger.error("Failed:", error);

      const output = stderrSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("test error");
      expect(output).toContain("Error:");
    });

    it("formats objects as JSON", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "info" });

      logger.info("Data:", { foo: "bar", count: 42 });

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain('"foo": "bar"');
      expect(output).toContain('"count": 42');
    });

    it("handles null and undefined", () => {
      const platform = mockPlatform();
      const logger = createLogger({ platform, level: "info" });

      logger.info("Values:", null, undefined);

      const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("null");
      expect(output).toContain("undefined");
    });
  });

  describe("platform implementations", () => {
    describe("githubPlatform", () => {
      it("emits ::error:: annotation", () => {
        githubPlatform.emitErrorAnnotation?.("test error");

        const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
        expect(output).toBe("::error::test error\n");
      });

      it("emits ::group:: and ::endgroup::", () => {
        const id = githubPlatform.startGroup("Test");
        githubPlatform.endGroup(id);

        const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
        expect(output).toContain("::group::Test\n");
        expect(output).toContain("::endgroup::\n");
      });
    });

    describe("gitlabPlatform", () => {
      it("does not have emitErrorAnnotation", () => {
        expect(gitlabPlatform.emitErrorAnnotation).toBeUndefined();
      });

      it("emits section_start and section_end", () => {
        const id = gitlabPlatform.startGroup("Test Section");
        gitlabPlatform.endGroup(id);

        const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
        expect(output).toMatch(/section_start:\d+:/);
        expect(output).toContain("Test Section");
        expect(output).toMatch(/section_end:\d+:/);
      });
    });
  });
});
