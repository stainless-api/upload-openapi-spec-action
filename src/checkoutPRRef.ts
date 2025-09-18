import spawn from "nano-spawn";
import { getInput } from "./compat";
import { getMergeBase, saveConfig } from "./config";

function assertRef(ref: string): asserts ref is "base" | "head" {
  if (ref !== "base" && ref !== "head") {
    throw new Error(`Expected ref to be 'base' or 'head', but was ${ref}`);
  }
}

async function main() {
  try {
    const ref = getInput("ref", { required: true });
    const oasPath = getInput("oas_path", { required: true });
    const configPath =
      getInput("config_path", { required: false }) || undefined;
    const baseSha = getInput("base_sha", { required: true });
    const headSha = getInput("head_sha", { required: true });

    assertRef(ref);

    const { mergeBaseSha } = await getMergeBase({ baseSha, headSha });

    if (ref === "base") {
      // Checkout the merge base SHA, which users will generate their OAS and
      // possibly config from.
      await spawn("git", ["checkout", mergeBaseSha]);
      return;
    }

    // Callers come in from checkout-pr-ref against base; save the config.
    const { hasOAS, savedSha } = await saveConfig({ oasPath, configPath });
    if (!hasOAS) {
      throw new Error(`Expected OpenAPI spec at ${oasPath}.`);
    }
    if (savedSha !== null && savedSha !== mergeBaseSha) {
      console.warn(
        `Expected HEAD to be ${mergeBaseSha}, but was ${savedSha}. This might cause issues with getting the base revision.`,
      );
    }

    // Checkout the head SHA.
    await spawn("git", ["checkout", headSha]);
  } catch (error) {
    console.error("Error in checkout-pr-ref action:", error);
    process.exit(1);
  }
}

main();
