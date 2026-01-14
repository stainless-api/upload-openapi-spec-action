import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findFiles,
  loadSpec,
  saveSpec,
  countPaths,
  combineOpenAPISpecs,
  type OpenAPISpec,
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
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toContain("products-api.yaml");
      expect(result.emptyPatterns).toHaveLength(0);
    });

    it("should find files with multiple patterns", async () => {
      const result = await findFiles(
        `${fixturesDir}/*.json, ${fixturesDir}/*.yaml`,
      );
      expect(result.files).toHaveLength(2);
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
      expect(result.files).toHaveLength(1); // products-api.yaml
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
  });
});
