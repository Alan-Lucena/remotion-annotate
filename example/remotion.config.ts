// Example: drop this into your Remotion project's remotion.config.ts
import { Config } from "@remotion/cli/config";
import { enableAnnotate } from "remotion-annotate";

// ...your normal config...

// Enable the annotation overlay only when ANNOTATE=1, so normal dev/renders
// are untouched. Run it with:  ANNOTATE=1 npx remotion studio
if (process.env.ANNOTATE) {
  Config.overrideWebpackConfig((config) => enableAnnotate(config));
}
