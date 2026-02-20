import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGitLabLogging } from "./logging";

describe("gitlabPlatform", () => {
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

  it("emitErrorAnnotation does not do anything", () => {
    const logging = getGitLabLogging();
    logging.emitErrorAnnotation("test error");

    expect(stderrSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it("emits section_start and section_end", () => {
    const logging = getGitLabLogging();
    const id = logging.startGroup("Test Section");
    logging.endGroup(id);

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join("");
    expect(output).toMatch(/section_start:\d+:/);
    expect(output).toContain("Test Section");
    expect(output).toMatch(/section_end:\d+:/);
  });
});
