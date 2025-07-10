import { getInput } from "@actions/core";
import * as exec from "@actions/exec";
import { getMergeBase, saveConfig } from "./config";

async function main() {
  try {
    const oasPath = getInput("oas_path", { required: true });
    const configPath =
      getInput("config_path", { required: false }) || undefined;
    const baseSha = getInput("base_sha", { required: true });
    const headSha = getInput("head_sha", { required: true });

    const { savedOAS, savedSha } = await saveConfig({ oasPath, configPath });
    if (!savedOAS) {
      throw new Error(`Expected OpenAPI spec at ${oasPath}.`);
    }
    if (savedSha !== headSha) {
      throw new Error(`Expected HEAD to be ${headSha}, but was ${savedSha}`);
    }

    // Checkout the merge base SHA, which users will generate their OAS and
    // possibly config from.
    const { mergeBaseSha } = await getMergeBase({ baseSha, headSha });
    await exec.exec("git", ["checkout", mergeBaseSha], { silent: true });
  } catch (error) {
    console.error("Error in checkout-base action:", error);
    process.exit(1);
  }
}

main();
