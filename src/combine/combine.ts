/**
 * Combines multiple OpenAPI specification files into a single file.
 * Uses Redocly CLI's `join` command for proper OpenAPI handling.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import spawn from "nano-spawn";
import YAML from "yaml";
import { logger } from "../logger";

export interface OpenAPISpec {
  openapi: string;
  paths?: Record<string, Record<string, unknown>>;
  servers?: Server[];
  [key: string]: unknown;
}

export interface Server {
  url: string;
  description?: string;
  variables?: Record<string, unknown>;
}

export interface ServerUrlStrategy {
  global?: string;
  preserve?: string[];
}

export interface CombineResult {
  spec: OpenAPISpec;
  pathCountBefore: number;
  pathCountAfter: number;
}

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
] as const;

export interface FindFilesResult {
  files: string[];
  /** Patterns that matched zero files */
  emptyPatterns: string[];
}

/**
 * Find files matching comma-separated glob patterns or direct paths.
 */
export async function findFiles(patterns: string): Promise<FindFilesResult> {
  const allFiles: string[] = [];
  const emptyPatterns: string[] = [];
  const patternList = patterns.split(",").map((p) => p.trim());

  for (const pattern of patternList) {
    const files = await glob(pattern, { absolute: true });
    if (files.length === 0) {
      emptyPatterns.push(pattern);
    } else {
      allFiles.push(...files);
    }
  }

  return {
    files: [...new Set(allFiles)],
    emptyPatterns,
  };
}

/**
 * Load an OpenAPI spec from JSON or YAML file.
 */
export async function loadSpec(filePath: string): Promise<OpenAPISpec> {
  const content = await fs.readFile(filePath, "utf-8");
  if (filePath.endsWith(".json")) {
    return JSON.parse(content);
  }
  return YAML.parse(content);
}

/**
 * Save an OpenAPI spec as YAML or JSON based on file extension.
 */
export async function saveSpec(
  spec: OpenAPISpec,
  filePath: string,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const isJson = filePath.endsWith(".json");
  const content = isJson
    ? JSON.stringify(spec, null, 2) + "\n"
    : YAML.stringify(spec, { lineWidth: 0, aliasDuplicateObjects: false });

  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Count paths in an OpenAPI spec.
 */
export function countPaths(spec: OpenAPISpec): number {
  return Object.keys(spec.paths || {}).length;
}

/**
 * Add a base query parameter to a path to disambiguate collisions.
 */
export function addBaseToPath(pathKey: string, baseUrl: string): string {
  const url = new URL(baseUrl);
  const urlPath = url.pathname.replace(/\/+$/, "");
  const base = urlPath ? `${url.hostname}${urlPath}` : url.hostname;
  const [pathname, queryString] = pathKey.split("?");
  const params = new URLSearchParams(queryString || "");
  params.set("base", base);
  return `${pathname}?${params.toString()}`;
}

/**
 * Convert text to a URL-friendly slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface SpecEntry {
  file: string;
  spec: OpenAPISpec;
}

/**
 * Derive unique slugs from spec titles, appending counters for duplicates.
 */
export function deriveSlugs(entries: SpecEntry[]): string[] {
  const rawSlugs = entries.map((entry, i) => {
    const info = entry.spec.info as Record<string, unknown> | undefined;
    const title = info?.title;
    return typeof title === "string" && title ? slugify(title) : `spec-${i}`;
  });

  const counts = new Map<string, number>();
  const result: string[] = [];
  for (const slug of rawSlugs) {
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    result.push(count === 0 ? slug : `${slug}-${count}`);
  }

  // If any slug had duplicates, retroactively suffix the first occurrence
  for (let i = 0; i < result.length; i++) {
    const slug = rawSlugs[i];
    if ((counts.get(slug) ?? 0) > 1 && result[i] === slug) {
      result[i] = `${slug}-0`;
    }
  }

  return result;
}

/**
 * Find operationIds that appear in more than one spec.
 */
export function findConflictingOperationIds(entries: SpecEntry[]): Set<string> {
  const seen = new Map<string, number>();

  for (const { spec } of entries) {
    for (const pathItem of Object.values(spec.paths || {})) {
      for (const method of HTTP_METHODS) {
        const op = pathItem[method] as Record<string, unknown> | undefined;
        if (op?.operationId && typeof op.operationId === "string") {
          seen.set(op.operationId, (seen.get(op.operationId) ?? 0) + 1);
        }
      }
    }
  }

  const conflicting = new Set<string>();
  for (const [id, count] of seen) {
    if (count > 1) conflicting.add(id);
  }
  return conflicting;
}

/**
 * Deep-clone a spec and prefix conflicting operationIds with a slug.
 */
export function deduplicateOperationIds(
  spec: OpenAPISpec,
  slug: string,
  conflicting: Set<string>,
): OpenAPISpec {
  const cloned: OpenAPISpec = JSON.parse(JSON.stringify(spec));

  for (const pathItem of Object.values(cloned.paths || {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method] as Record<string, unknown> | undefined;
      if (
        op?.operationId &&
        typeof op.operationId === "string" &&
        conflicting.has(op.operationId)
      ) {
        op.operationId = `${slug}_${op.operationId}`;
      }
    }
  }

  return cloned;
}

/**
 * Process a spec according to the server URL strategy.
 */
function processSpecForServers(
  spec: OpenAPISpec,
  strategy: ServerUrlStrategy,
): OpenAPISpec {
  const processed: OpenAPISpec = {
    ...spec,
    paths: {},
  };

  if (!spec.servers || spec.servers.length === 0) {
    if (spec.paths) {
      processed.paths = { ...spec.paths };
    }
    return processed;
  }

  // Find first matching preserved URL
  const preservedServerUrl = spec.servers.find((server) =>
    strategy.preserve?.includes(server.url),
  )?.url;

  if (preservedServerUrl) {
    const servers = spec.servers;

    if (spec.paths) {
      for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
        const newPathKey = addBaseToPath(pathKey, preservedServerUrl);
        const newPathItem = { ...pathItem };

        for (const method of HTTP_METHODS) {
          if (newPathItem[method]) {
            newPathItem[method] = {
              ...(newPathItem[method] as Record<string, unknown>),
              ...((newPathItem[method] as Record<string, unknown>).servers
                ? {}
                : { servers }),
            };
          }
        }

        processed.paths![newPathKey] = newPathItem;
      }
    }

    delete processed.servers;
  } else {
    const hasGlobal =
      strategy.global &&
      spec.servers.some((server) => server.url === strategy.global);

    if (!hasGlobal) {
      delete processed.servers;
    }

    if (spec.paths) {
      processed.paths = { ...spec.paths };
    }
  }

  return processed;
}

/**
 * Combine multiple spec files into one using Redocly CLI.
 */
async function combineSpecs(
  files: string[],
  outputPath: string,
  serverStrategy?: ServerUrlStrategy,
  prefixWithInfo?: boolean,
): Promise<void> {
  if (files.length === 0) {
    throw new Error("No files to combine");
  }

  if (files.length === 1) {
    // Single file: apply strategy and save
    let spec = await loadSpec(files[0]);

    if (serverStrategy) {
      spec = processSpecForServers(spec, serverStrategy);
      if (serverStrategy.global && !spec.servers) {
        spec.servers = [{ url: serverStrategy.global }];
      }
    }

    await saveSpec(spec, outputPath);
    return;
  }

  // Prepare files for combining
  let filesToCombine = files;
  const tempDir = serverStrategy
    ? path.join(path.dirname(outputPath), ".temp-combine")
    : null;

  try {
    // Process specs if server strategy is provided
    if (serverStrategy && tempDir) {
      await fs.mkdir(tempDir, { recursive: true });
      filesToCombine = [];

      for (let i = 0; i < files.length; i++) {
        const spec = await loadSpec(files[i]);
        const processed = processSpecForServers(spec, serverStrategy);
        const tempFile = path.join(tempDir, `temp-${i}.yaml`);
        await saveSpec(processed, tempFile);
        filesToCombine.push(tempFile);
      }
    }

    // Use Redocly join to combine specs
    const jsonPath = outputPath.replace(/\.ya?ml$/, "") + ".json";
    const jsonDir = path.dirname(jsonPath);
    await fs.mkdir(jsonDir, { recursive: true });

    logger.debug(`Running: npx @redocly/cli join ... -o "${jsonPath}"`);

    // Redocly CLI outputs to stderr instead of files when NODE_ENV=test
    const env = { ...process.env, NODE_ENV: "production" };

    const joinArgs = [
      "@redocly/cli",
      "join",
      ...filesToCombine,
      "-o",
      jsonPath,
    ];
    if (prefixWithInfo) {
      joinArgs.push(
        "--prefix-tags-with-info-prop=title",
        "--prefix-components-with-info-prop=title",
      );
    }

    try {
      await spawn("npx", joinArgs, { env });
    } catch (error: unknown) {
      const stderr =
        error && typeof error === "object" && "stderr" in error
          ? (error as { stderr: string }).stderr
          : "";
      throw new Error(`Redocly join failed: ${stderr || String(error)}`);
    }

    // Load combined spec
    const combinedSpec = await loadSpec(jsonPath);

    // Apply global server if needed
    if (serverStrategy?.global && !combinedSpec.servers) {
      combinedSpec.servers = [{ url: serverStrategy.global }];
    }

    await saveSpec(combinedSpec, outputPath);

    // Clean up JSON file
    await fs.unlink(jsonPath).catch(() => {});
  } finally {
    // Clean up temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Main function to combine OpenAPI specs.
 */
export async function combineOpenAPISpecs(
  inputPatterns: string,
  outputPath: string,
  serverStrategy?: ServerUrlStrategy,
  prefixWithInfo?: boolean,
): Promise<CombineResult> {
  const { files, emptyPatterns } = await findFiles(inputPatterns);

  if (emptyPatterns.length > 0) {
    for (const pattern of emptyPatterns) {
      logger.warn(`No files matched: ${pattern}`);
    }
  }

  if (files.length === 0) {
    throw new Error(
      `No files found matching input patterns.\n\n` +
        `Patterns that matched nothing:\n` +
        emptyPatterns.map((p) => `  - ${p}`).join("\n") +
        `\n\nMake sure:\n` +
        `  1. You have checked out the repository using actions/checkout@v4\n` +
        `  2. The file paths are correct relative to the repository root\n` +
        `  3. The files exist in your repository`,
    );
  }

  logger.info(`Found ${files.length} file(s) to combine`);
  for (const file of files) {
    logger.debug(`  - ${file}`);
  }

  // Load all specs to count paths and detect operationId conflicts
  const entries: SpecEntry[] = [];
  let pathCountBefore = 0;
  for (const file of files) {
    const spec = await loadSpec(file);
    pathCountBefore += countPaths(spec);
    entries.push({ file, spec });
  }

  // Deduplicate conflicting operationIds across specs
  const conflicting = findConflictingOperationIds(entries);
  let filesToCombine = files;
  let dedupTempDir: string | null = null;

  if (conflicting.size > 0) {
    logger.info(
      `Found ${conflicting.size} conflicting operationId(s): ${[...conflicting].join(", ")}`,
    );
    const slugs = deriveSlugs(entries);
    dedupTempDir = path.join(path.dirname(outputPath), ".temp-dedup");
    await fs.mkdir(dedupTempDir, { recursive: true });
    filesToCombine = [];

    for (let i = 0; i < entries.length; i++) {
      const deduped = deduplicateOperationIds(
        entries[i].spec,
        slugs[i],
        conflicting,
      );
      const ext = entries[i].file.endsWith(".json") ? ".json" : ".yaml";
      const tempFile = path.join(dedupTempDir, `dedup-${i}${ext}`);
      await saveSpec(deduped, tempFile);
      filesToCombine.push(tempFile);
    }
  }

  try {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Combine specs
    await combineSpecs(
      filesToCombine,
      outputPath,
      serverStrategy,
      prefixWithInfo,
    );

    // Load combined spec to count paths
    const combinedSpec = await loadSpec(outputPath);
    const pathCountAfter = countPaths(combinedSpec);

    return {
      spec: combinedSpec,
      pathCountBefore,
      pathCountAfter,
    };
  } finally {
    if (dedupTempDir) {
      await fs
        .rm(dedupTempDir, { recursive: true, force: true })
        .catch(() => {});
    }
  }
}
