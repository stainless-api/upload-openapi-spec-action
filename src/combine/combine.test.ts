import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findFiles,
  loadSpec,
  saveSpec,
  countPaths,
  combineOpenAPISpecs,
  addBaseToPath,
  slugify,
  deriveSlugs,
  findConflictingOperationIds,
  deduplicateOperationIds,
  type OpenAPISpec,
  type SpecEntry,
} from "./combine";

describe("combine", () => {
  const fixturesDir = path.resolve(__dirname, "../__fixtures__");
  const tempDir = path.resolve(__dirname, "../../temp-test");

  beforeEach(async () => {
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("findFiles", () => {
    it("should find files with glob patterns", async () => {
      const result = await findFiles(`${fixturesDir}/*.yaml`);
      expect(result.files.length).toBeGreaterThanOrEqual(1);
      expect(result.files.some((f) => f.includes("products-api.yaml"))).toBe(
        true,
      );
      expect(result.emptyPatterns).toHaveLength(0);
    });

    it("should find files with multiple patterns", async () => {
      const result = await findFiles(
        `${fixturesDir}/*.json, ${fixturesDir}/*.yaml`,
      );
      expect(result.files.length).toBeGreaterThanOrEqual(2);
      expect(result.files.some((f) => f.includes("users-api.json"))).toBe(true);
      expect(result.files.some((f) => f.includes("products-api.yaml"))).toBe(
        true,
      );
      expect(result.emptyPatterns).toHaveLength(0);
    });

    it("should handle direct file paths", async () => {
      const result = await findFiles(`${fixturesDir}/users-api.json`);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain("users-api.json");
      expect(result.emptyPatterns).toHaveLength(0);
    });

    it("should track patterns that match nothing", async () => {
      const result = await findFiles(`${fixturesDir}/*.nonexistent`);
      expect(result.files).toHaveLength(0);
      expect(result.emptyPatterns).toHaveLength(1);
      expect(result.emptyPatterns[0]).toContain("*.nonexistent");
    });

    it("should track multiple empty patterns separately", async () => {
      const result = await findFiles(
        `${fixturesDir}/*.yaml, ${fixturesDir}/missing.json, ${fixturesDir}/*.nope`,
      );
      expect(result.files.length).toBeGreaterThanOrEqual(1);
      expect(result.files.some((f) => f.includes("products-api.yaml"))).toBe(
        true,
      );
      expect(result.emptyPatterns).toHaveLength(2);
      expect(result.emptyPatterns).toContain(`${fixturesDir}/missing.json`);
      expect(result.emptyPatterns).toContain(`${fixturesDir}/*.nope`);
    });
  });

  describe("loadSpec", () => {
    it("should load JSON files", async () => {
      const spec = await loadSpec(`${fixturesDir}/users-api.json`);
      expect(spec.openapi).toBe("3.0.0");
      expect(spec.info).toHaveProperty("title", "Users API");
      expect(spec.paths).toBeDefined();
    });

    it("should load YAML files", async () => {
      const spec = await loadSpec(`${fixturesDir}/products-api.yaml`);
      expect(spec.openapi).toBe("3.0.0");
      expect(spec.info).toHaveProperty("title", "Products API");
      expect(spec.paths).toBeDefined();
    });
  });

  describe("saveSpec", () => {
    it("should save spec as YAML when path ends with .yaml", async () => {
      const spec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: { "/test": { get: { responses: { "200": {} } } } },
      };

      const outputPath = path.join(tempDir, "test-output.yaml");
      await saveSpec(spec, outputPath);

      const content = await fs.readFile(outputPath, "utf-8");
      expect(content).toContain("openapi: 3.0.0");
      expect(content).toContain("title: Test API");
      expect(content).toMatch(/^openapi:/); // Starts with YAML, not JSON
    });

    it("should save spec as JSON when path ends with .json", async () => {
      const spec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: { "/test": { get: { responses: { "200": {} } } } },
      };

      const outputPath = path.join(tempDir, "test-output.json");
      await saveSpec(spec, outputPath);

      const content = await fs.readFile(outputPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.openapi).toBe("3.0.0");
      expect(parsed.info.title).toBe("Test API");
    });

    it("should create directories if they do not exist", async () => {
      const spec: OpenAPISpec = {
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
      };

      const outputPath = path.join(tempDir, "nested/dir/test.yaml");
      await saveSpec(spec, outputPath);

      const exists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("countPaths", () => {
    it("should count paths correctly", () => {
      const spec: OpenAPISpec = {
        openapi: "3.0.0",
        paths: {
          "/users": {},
          "/users/{id}": {},
          "/products": {},
        },
      };
      expect(countPaths(spec)).toBe(3);
    });

    it("should return 0 for specs without paths", () => {
      const spec: OpenAPISpec = { openapi: "3.0.0" };
      expect(countPaths(spec)).toBe(0);
    });
  });

  describe("combineOpenAPISpecs", () => {
    it("should combine multiple specs successfully", async () => {
      const outputPath = path.join(tempDir, "combined.yaml");
      const result = await combineOpenAPISpecs(
        `${fixturesDir}/users-api.json, ${fixturesDir}/products-api.yaml`,
        outputPath,
      );

      expect(result.pathCountBefore).toBe(4); // 2 from users + 2 from products
      expect(result.pathCountAfter).toBe(4);
      expect(result.spec.paths).toHaveProperty("/users");
      expect(result.spec.paths).toHaveProperty("/products");

      const exists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should output JSON when path ends with .json", async () => {
      const outputPath = path.join(tempDir, "combined.json");
      await combineOpenAPISpecs(`${fixturesDir}/users-api.json`, outputPath);

      const content = await fs.readFile(outputPath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.openapi).toBe("3.0.0");
      expect(parsed.paths).toHaveProperty("/users");
    });

    it("should handle single file", async () => {
      const outputPath = path.join(tempDir, "single.yaml");
      const result = await combineOpenAPISpecs(
        `${fixturesDir}/users-api.json`,
        outputPath,
      );

      expect(result.pathCountBefore).toBe(2);
      expect(result.pathCountAfter).toBe(2);
      expect(result.spec.paths).toHaveProperty("/users");
    });

    it("should throw descriptive error for non-existent files", async () => {
      const outputPath = path.join(tempDir, "error.yaml");

      await expect(
        combineOpenAPISpecs("non-existent-file.yaml", outputPath),
      ).rejects.toThrow(/No files found matching input patterns/);

      await expect(
        combineOpenAPISpecs("non-existent-file.yaml", outputPath),
      ).rejects.toThrow(/non-existent-file\.yaml/);

      await expect(
        combineOpenAPISpecs("non-existent-file.yaml", outputPath),
      ).rejects.toThrow(/actions\/checkout/);
    });

    it("should throw error listing all empty patterns", async () => {
      const outputPath = path.join(tempDir, "error.yaml");

      await expect(
        combineOpenAPISpecs("missing1.yaml, missing2.json", outputPath),
      ).rejects.toThrow(/missing1\.yaml/);

      await expect(
        combineOpenAPISpecs("missing1.yaml, missing2.json", outputPath),
      ).rejects.toThrow(/missing2\.json/);
    });

    it("should deduplicate conflicting operationIds across specs", async () => {
      const outputPath = path.join(tempDir, "combined-dedup.yaml");
      const serverStrategy = {
        global: "https://api.example.com",
        preserve: [
          "https://api.example.com/service-a",
          "https://api.example.com/service-b",
        ],
      };
      const result = await combineOpenAPISpecs(
        `${fixturesDir}/service-a.yaml, ${fixturesDir}/service-b.yaml`,
        outputPath,
        serverStrategy,
        true,
      );

      const spec = result.spec;

      // All paths should be preserved
      expect(result.pathCountBefore).toBe(4);
      expect(result.pathCountAfter).toBe(4);

      // Collect all operationIds from the combined spec
      const operationIds: string[] = [];
      for (const pathItem of Object.values(spec.paths || {})) {
        for (const method of [
          "get",
          "post",
          "put",
          "delete",
          "patch",
        ] as const) {
          const op = pathItem[method] as Record<string, unknown> | undefined;
          if (op?.operationId && typeof op.operationId === "string") {
            operationIds.push(op.operationId);
          }
        }
      }

      // listTenants was conflicting — both should be prefixed
      expect(
        operationIds.some(
          (id) => id.includes("service-a") && id.includes("listTenants"),
        ),
      ).toBe(true);
      expect(
        operationIds.some(
          (id) => id.includes("service-b") && id.includes("listTenants"),
        ),
      ).toBe(true);

      // Non-conflicting IDs should still exist (possibly prefixed by Redocly with prefix_with_info)
      expect(operationIds.some((id) => id.includes("getTenant"))).toBe(true);
      expect(operationIds.some((id) => id.includes("healthCheck"))).toBe(true);
    });
  });

  describe("addBaseToPath", () => {
    it("should include URL path in base parameter", () => {
      const result = addBaseToPath(
        "/health",
        "https://api.staging.cloud.cisco.com/api-vault-service",
      );
      expect(result).toBe(
        "/health?base=api.staging.cloud.cisco.com%2Fapi-vault-service",
      );
    });

    it("should use hostname only when no path", () => {
      const result = addBaseToPath("/health", "https://cifls.webex.com");
      expect(result).toBe("/health?base=cifls.webex.com");
    });

    it("should strip trailing slashes from URL path", () => {
      const result = addBaseToPath("/test", "https://api.example.com/service/");
      expect(result).toBe("/test?base=api.example.com%2Fservice");
    });
  });

  describe("slugify", () => {
    it("should convert basic text", () => {
      expect(slugify("Service A")).toBe("service-a");
    });

    it("should handle special characters", () => {
      expect(slugify("My API (v2.1)")).toBe("my-api-v2-1");
    });

    it("should handle empty string", () => {
      expect(slugify("")).toBe("");
    });
  });

  describe("deriveSlugs", () => {
    it("should derive slugs from unique titles", () => {
      const entries = [
        {
          file: "a.yaml",
          spec: { openapi: "3.0.0", info: { title: "Service A" } },
        },
        {
          file: "b.yaml",
          spec: { openapi: "3.0.0", info: { title: "Service B" } },
        },
      ];
      expect(deriveSlugs(entries)).toEqual(["service-a", "service-b"]);
    });

    it("should append counter for duplicate titles", () => {
      const entries = [
        { file: "a.yaml", spec: { openapi: "3.0.0", info: { title: "API" } } },
        { file: "b.yaml", spec: { openapi: "3.0.0", info: { title: "API" } } },
        { file: "c.yaml", spec: { openapi: "3.0.0", info: { title: "API" } } },
      ];
      expect(deriveSlugs(entries)).toEqual(["api-0", "api-1", "api-2"]);
    });

    it("should use fallback for missing title", () => {
      const entries = [
        { file: "a.yaml", spec: { openapi: "3.0.0" } },
        { file: "b.yaml", spec: { openapi: "3.0.0", info: { title: "Real" } } },
      ];
      expect(deriveSlugs(entries)).toEqual(["spec-0", "real"]);
    });
  });

  describe("findConflictingOperationIds", () => {
    it("should return empty set when no conflicts", () => {
      const entries: SpecEntry[] = [
        {
          file: "a.yaml",
          spec: {
            openapi: "3.0.0",
            paths: { "/a": { get: { operationId: "getA" } } },
          },
        },
        {
          file: "b.yaml",
          spec: {
            openapi: "3.0.0",
            paths: { "/b": { get: { operationId: "getB" } } },
          },
        },
      ];
      expect(findConflictingOperationIds(entries).size).toBe(0);
    });

    it("should detect conflicting operationIds", () => {
      const entries: SpecEntry[] = [
        {
          file: "a.yaml",
          spec: {
            openapi: "3.0.0",
            paths: { "/a": { get: { operationId: "list" } } },
          },
        },
        {
          file: "b.yaml",
          spec: {
            openapi: "3.0.0",
            paths: { "/b": { get: { operationId: "list" } } },
          },
        },
      ];
      const result = findConflictingOperationIds(entries);
      expect(result.has("list")).toBe(true);
      expect(result.size).toBe(1);
    });

    it("should handle operations without operationId", () => {
      const entries: SpecEntry[] = [
        {
          file: "a.yaml",
          spec: {
            openapi: "3.0.0",
            paths: { "/a": { get: { summary: "no id" } } },
          },
        },
      ];
      expect(findConflictingOperationIds(entries).size).toBe(0);
    });
  });

  describe("deduplicateOperationIds", () => {
    it("should prefix conflicting operationIds", () => {
      const spec: OpenAPISpec = {
        openapi: "3.0.0",
        paths: {
          "/x": { get: { operationId: "list" } },
          "/y": { post: { operationId: "unique" } },
        },
      };
      const conflicting = new Set(["list"]);
      const result = deduplicateOperationIds(spec, "svc", conflicting);
      const getOp = result.paths!["/x"].get as Record<string, unknown>;
      const postOp = result.paths!["/y"].post as Record<string, unknown>;
      expect(getOp.operationId).toBe("svc_list");
      expect(postOp.operationId).toBe("unique");
    });

    it("should not mutate the input spec", () => {
      const spec: OpenAPISpec = {
        openapi: "3.0.0",
        paths: { "/x": { get: { operationId: "list" } } },
      };
      const conflicting = new Set(["list"]);
      deduplicateOperationIds(spec, "svc", conflicting);
      const getOp = spec.paths!["/x"].get as Record<string, unknown>;
      expect(getOp.operationId).toBe("list");
    });
  });
});
