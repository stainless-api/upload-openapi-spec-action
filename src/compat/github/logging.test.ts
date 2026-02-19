import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGitHubLogging } from "./logging";

describe("getGitHubLogging", () => {
  let stdoutSpy: Mock;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true) as unknown as Mock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits ::error:: annotation", () => {
    const logging = getGitHubLogging();
    logging.emitErrorAnnotation?.("test error");

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toBe("::error::test error\n");
  });

  it("emits ::group:: and ::endgroup::", () => {
    const logging = getGitHubLogging();
    const id = logging.startGroup("Test");
    logging.endGroup(id);

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toContain("::group::Test\n");
    expect(output).toContain("::endgroup::\n");
  });
});
