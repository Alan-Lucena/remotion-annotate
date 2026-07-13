---
name: remotion-annotate-apply
description: Apply pending remotion-annotate annotations from annotations.json to the Remotion source code
---

# Apply remotion-annotate Annotations

Read the user's visual annotations and apply each one to the source code.

## Steps

1. **Read `annotations.json`** at the Remotion project root (same folder as `remotion.config.ts`). If it is missing or `annotations` is empty, tell the user there is nothing to apply and exit.

2. **Understand the schema.** Each item in `annotations[]` has a `kind`, a `message` (what the user wants), and a `target`:

   - `feedback` — change one element. `target.loc` is `"file:line:col"` relative to the project root, pointing at the element's JSX opening tag. `target.component`, `target.tag`, `target.text`, and `target.styles` help you confirm you are at the right place. `target.frame` (if present) is the video frame the user was looking at.
   - `timeRange` — applies to a span of the video: `target.frame` → `target.toFrame`. Typical asks: retime a `<Sequence>`, add/remove something during that span, change pacing.
   - `region` — the user drew a box on the canvas: `target.region` is `{xPct, yPct, wPct, hPct}` as percentages of the composition area, plus `target.frame`. Typical ask: create/place a new element there. Convert percentages to the composition's pixel size.
   - `multi` — one instruction for several elements: `targets[]` each with `loc`/`selector`/`text`.

3. **Apply each annotation**
   - Open the file at `target.loc` and find the element at that line (the line points at the opening tag; if the file shifted, locate it by `component` + `text`)
   - Make the change the `message` asks for, following the project's existing code style
   - For `region`/`timeRange`, pick the scene/Sequence that covers `target.frame` to decide where the change belongs

4. **Clear the file.** After applying everything, reset it to:

   ```json
   { "version": "1.0", "composition": "<keep the existing value>", "annotations": [] }
   ```

5. **Report** what you changed for each annotation, one line per item (file + summary). If any annotation was ambiguous or skipped, say so explicitly.

## Notes

- Line/col in `loc` are stamped at build time; if the file was edited since, trust `component` + `text` over the raw line number
- `frame` numbers are in the composition's fps (read it from the `<Composition>` definition if you need seconds)
- Do not re-format unrelated code; make surgical edits
