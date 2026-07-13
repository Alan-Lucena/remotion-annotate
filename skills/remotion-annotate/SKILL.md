---
name: remotion-annotate
description: Set up remotion-annotate (click-to-edit visual overlay for Remotion Studio) in a Remotion project
---

# remotion-annotate Setup

Set up the remotion-annotate overlay in this Remotion project.

## Steps

1. **Check this is a Remotion project**
   - Look for `remotion` in package.json dependencies and a `remotion.config.ts` (or `.js`) file
   - If it is not a Remotion project, tell the user and exit

2. **Check if already installed**
   - Look for `remotion-annotate` in package.json devDependencies
   - Search for `enableAnnotate` in the Remotion config
   - If both are present, report it is already set up and exit

3. **Install the package**
   - Detect the package manager from the lockfile (package-lock.json → npm, pnpm-lock.yaml → pnpm, yarn.lock → yarn, bun.lockb → bun)
   - Install as a dev dependency, e.g. `npm i -D remotion-annotate`

4. **Wire it into the Remotion config**

   In `remotion.config.ts`, add:

   ```ts
   import { enableAnnotate } from "remotion-annotate";

   if (process.env.ANNOTATE) {
     Config.overrideWebpackConfig((config) => enableAnnotate(config));
   }
   ```

   - If the config ALREADY calls `Config.overrideWebpackConfig` (e.g. `enableTailwind`), compose instead of adding a second call:

   ```ts
   Config.overrideWebpackConfig((config) => {
     const withExisting = enableTailwind(config); // whatever was there before
     return process.env.ANNOTATE ? enableAnnotate(withExisting) : withExisting;
   });
   ```

   - If the project's source folder is not `src/`, pass it: `enableAnnotate(config, { include: "path/to/sources" })`
   - If port 7331 is taken, pass `{ port: <other> }`

5. **Add a convenience script** to package.json:

   ```json
   "dev:annotate": "ANNOTATE=1 remotion studio"
   ```

   (On Windows, use `cross-env ANNOTATE=1 remotion studio` and install `cross-env`.)

6. **Verify**
   - Run `ANNOTATE=1 npx remotion studio` briefly
   - Confirm the terminal prints `[annotate] bridge on http://localhost:7331`
   - Tell the user to open Studio, click the round button in the bottom-right corner (or press `A`), and hover any element

7. **Explain the loop to the user**
   - Hover an element → `+` annotate, `✎` edit text in place, sliders icon to edit props visually (writes straight to the source, Cmd+Z undoes)
   - `I` / `O` (or the diamond button) mark a time range; the region button drags a box on empty canvas; shift-click multi-selects
   - Annotations land in `annotations.json` at the project root, and the toolbar's copy button produces a markdown block
   - To apply annotations with an agent, use the `/remotion-annotate-apply` skill or say "read annotations.json and apply each change"

## Notes

- The overlay is OFF by default: without `ANNOTATE=1`, normal dev and renders are untouched
- Requires Remotion 4 and a Chromium-based browser
- The bridge runs in-process with Studio (it lives and dies with it), on port 7331 by default
- Direct edits only touch static literals; animated/variable values are shown grayed with an opt-in "force" override
