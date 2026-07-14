# remotion-annotate

Click-to-edit visual overlay for [Remotion](https://remotion.dev) Studio, in the
spirit of [Agentation](https://agentation.com). Select any element in the preview and:

![remotion-annotate demo](assets/demo.gif)

<sub>This demo was rendered with Remotion itself — see [`demo/`](demo/).</sub>

- **Tweak props visually**: sliders for numbers, color pickers, dropdowns for enums. Writes straight to your `.tsx` (surgical AST edit, no reformatting). Cmd+Z to undo.
- **Edit text in place**: pencil on a text element, type, Enter. Direct to source.
- **Annotate for your agent**: click, write what to change, copy a clean markdown block, paste into Claude Code / Codex.
- **Frame-aware**: annotations capture the current frame; click to seek back to that moment.
- **Region + multi-select**: draw a box on an empty area ("write hello here"), or shift-click several elements to annotate or delete them at once.

It runs a small in-process bridge (so it never goes "offline" while Studio is up) and shows a green/red status dot.

## Install

```bash
npm i -D remotion-annotate
```

Or with yarn, pnpm, or bun.

### Claude Code

If you use Claude Code, you can set up remotion-annotate automatically with the `/remotion-annotate` skill. Install it:

```bash
npx skills add Alan-Lucena/remotion-annotate
```

Then in Claude Code:

```
/remotion-annotate
```

It detects your Remotion project, installs the package, wires it into `remotion.config.ts`, and adds a `dev:annotate` script.

There is also `/remotion-annotate-apply`: it reads your pending annotations from `annotations.json`, applies each change to the source, and clears the queue.

## Enable

In your `remotion.config.ts`:

```ts
import { Config } from "@remotion/cli/config";
import { enableAnnotate } from "remotion-annotate";

if (process.env.ANNOTATE) {
  Config.overrideWebpackConfig((config) => enableAnnotate(config));
}
```

Then start Studio with it on:

```bash
ANNOTATE=1 npx remotion studio
```

Off by default: without `ANNOTATE=1`, your normal `npm run dev` and renders are untouched.

Open Studio, click the round button (bottom-right) or press `A`, then hover any element.

## How it works

```
ANNOTATE=1 remotion studio
  -> remotion.config.ts -> enableAnnotate(config)
       1. data-loc loader   stamps each host JSX element with file:line:col
       2. overlay entry      the UI auto-mounts in Studio (the FAB)
       3. studio-hooks entry exposes Remotion's seek() for click-to-seek
       4. in-process bridge  HTTP API on :7331 that reads/writes your source
```

Edits go through a Babel AST: the bridge finds the element by its `data-loc`,
classifies which attributes are static literals (editable) vs animated/variable
(shown grayed, with a "force" override), and splices only the exact characters so
the rest of your file stays byte-identical.

## Options

```ts
enableAnnotate(config, {
  port: 7331,          // bridge HTTP port
  root: process.cwd(), // project root
  include: "src",      // which files get data-loc
});
```

## The agent loop

Annotations are written to `annotations.json` at your project root and can be
copied as markdown from the toolbar. Point your coding agent at either one:

> Read annotations.json. Each item has a `target.loc` (file:line:col) and a
> message. Apply each change, then clear the file.

## Notes

- Desktop Chromium (Chrome / Brave / Edge). All source writes go through the local in-process bridge.
- "Force" editing a variable or animated value replaces it with a fixed literal (it will drop the animation). It is opt-in and undoable.
- Requires Remotion 4.

## License

MIT
