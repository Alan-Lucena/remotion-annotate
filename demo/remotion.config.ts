import { Config } from "@remotion/cli/config";
import path from "node:path";
import { pathToFileURL } from "node:url";

Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);

// Dogfood: edit the demo with remotion-annotate itself.
// Dynamic import keeps the package ESM (import.meta) intact.
if (process.env.ANNOTATE) {
  const pkg = pathToFileURL(path.resolve(process.cwd(), "../src/index.mjs")).href;
  Config.overrideWebpackConfig(async (c) => {
    const { enableAnnotate } = await import(pkg);
    return enableAnnotate(c);
  });
}
