// remotion-annotate — click-to-edit visual overlay for Remotion Studio.
//
// Usage in remotion.config.ts:
//   import { Config } from "@remotion/cli/config";
//   import { enableAnnotate } from "remotion-annotate";
//   if (process.env.ANNOTATE) Config.overrideWebpackConfig(enableAnnotate);
//
// Then run:  ANNOTATE=1 npx remotion studio
//
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startBridge } from "./bridge.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export { startBridge };

/**
 * Compose into Remotion's webpack config to enable the annotation overlay.
 * @param {object} config  the webpack config Remotion passes to overrideWebpackConfig
 * @param {object} [options]
 * @param {number} [options.port=7331]     bridge HTTP port
 * @param {string} [options.root]          project root (default process.cwd())
 * @param {string|RegExp|Array} [options.include]  which files get data-loc (default <root>/src)
 */
export function enableAnnotate(config, options = {}) {
  const port = options.port ?? 7331;
  const root = options.root ?? process.cwd();
  const include = options.include ?? path.resolve(root, "src");
  const overlay = path.join(__dirname, "overlay.js");
  const studioHooks = path.join(__dirname, "studio-hooks.js");
  const loader = path.join(__dirname, "loader.cjs");

  // Start the bridge IN THIS PROCESS so it lives exactly as long as Studio
  // (never "offline"). EADDRINUSE is handled inside startBridge.
  try {
    startBridge(root, { port });
  } catch (e) {
    console.error("[remotion-annotate] could not start bridge:", e);
  }

  // studio-hooks first (exposes seek), then the overlay UI, then the app.
  let entry = config.entry;
  if (typeof entry === "string") entry = [studioHooks, overlay, entry];
  else if (Array.isArray(entry)) entry = [studioHooks, overlay, ...entry];

  // Inject the bridge port into the overlay bundle via DefinePlugin, if webpack
  // is resolvable (it is, via @remotion/bundler). Falls back to 7331 otherwise.
  const plugins = [...(config.plugins ?? [])];
  try {
    const webpack = require("webpack");
    plugins.push(new webpack.DefinePlugin({ __RA_PORT__: JSON.stringify(String(port)) }));
  } catch {
    // no webpack resolvable; overlay defaults to 7331
  }

  return {
    ...config,
    entry,
    plugins,
    module: {
      ...config.module,
      rules: [
        ...(config.module?.rules ?? []),
        { enforce: "pre", test: /\.tsx$/, include, use: [{ loader, options: { root } }] },
      ],
    },
  };
}

export default enableAnnotate;
