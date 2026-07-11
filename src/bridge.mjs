import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ast from "./ast.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Start the Remotion Annotate bridge.
 * Can run standalone (CLI) or in-process (imported from remotion.config.ts so it
 * lives exactly as long as Studio — no separate process that can go "offline").
 */
export function startBridge(targetDir, opts = {}) {
  const { port = Number(process.env.PORT || 7331), exitOnConflict = false } = opts;
  const TARGET_DIR = path.resolve(targetDir || process.cwd());
  const ANN_FILE = path.join(TARGET_DIR, "annotations.json");
  const OVERLAY = path.join(__dirname, "overlay.js");
  const undoStack = []; // { file, prevContent, postContent }

  const cors = (res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  };
  const json = (res, obj, code = 200) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };
  const readBody = (req, cb) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { try { cb(JSON.parse(b || "{}")); } catch (e) { cb(null, e); } });
  };
  // Parse "rel/file.tsx:line:col" into a safe absolute path inside TARGET_DIR.
  const resolveLoc = (loc) => {
    const m = /^(.*):(\d+):(\d+)$/.exec(loc || "");
    if (!m) return null;
    const rel = m[1];
    const file = path.resolve(TARGET_DIR, rel);
    if (!file.startsWith(TARGET_DIR + path.sep) || !fs.existsSync(file)) return null;
    return { file, rel, line: parseInt(m[2], 10), col: parseInt(m[3], 10) };
  };
  const pushUndo = (file, prevContent, postContent) => {
    undoStack.push({ file, prevContent, postContent });
    if (undoStack.length > 50) undoStack.shift();
  };

  const server = http.createServer((req, res) => {
   try {
    cors(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }
    const url = (req.url || "/").split("?")[0];

    if (url === "/overlay.js") {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      return res.end(fs.readFileSync(OVERLAY, "utf8"));
    }

    if (url === "/annotations") {
      if (req.method === "GET") {
        res.setHeader("Content-Type", "application/json");
        return res.end(fs.existsSync(ANN_FILE) ? fs.readFileSync(ANN_FILE, "utf8") : "null");
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            fs.writeFileSync(ANN_FILE, body);
            res.end('{"ok":true}');
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
        return;
      }
    }

    // Direct text edit via AST (replaces the element's single text child).
    if (url === "/edit" && req.method === "POST") {
      readBody(req, (data, err) => {
        if (err || !data || typeof data.newText !== "string") {
          return json(res, { ok: false, applied: false, error: "bad payload" }, 400);
        }
        const L = resolveLoc(data.loc);
        if (!L) return json(res, { ok: false, applied: false, error: "file not allowed" });
        try {
          const r = ast.editText(L.file, L.line, L.col, data.newText, data.tag);
          if (r.applied) { pushUndo(L.file, r.prev, r.next); console.log(`[annotate] edit text ${L.rel}`); }
          json(res, { ok: true, applied: r.applied, file: L.rel, reason: r.reason, staleAfter: r.applied });
        } catch (e) { json(res, { ok: false, applied: false, error: String(e) }, 500); }
      });
      return;
    }

    // Classify the editable attributes of the element at loc.
    if (url === "/element" && req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams;
      const L = resolveLoc(q.get("loc"));
      if (!L) return json(res, { found: false, error: "file not allowed" });
      try { json(res, { ...ast.classify(L.file, L.line, L.col, q.get("tag") || undefined), loc: q.get("loc"), file: L.rel }); }
      catch (e) { json(res, { found: false, error: String(e) }, 500); }
      return;
    }

    // Edit a single static attribute value (number / color / enum / string).
    if (url === "/prop" && req.method === "POST") {
      readBody(req, (data, err) => {
        if (err || !data || typeof data.path !== "string") {
          return json(res, { ok: false, applied: false, error: "bad payload" }, 400);
        }
        const L = resolveLoc(data.loc);
        if (!L) return json(res, { ok: false, applied: false, error: "file not allowed" });
        try {
          const r = ast.writeAttribute(L.file, L.line, L.col, data.path, data.value, data.tag,
            { force: !!data.force, kind: data.kind });
          if (r.applied) { pushUndo(L.file, r.prev, r.next); console.log(`[annotate] prop ${L.rel} ${data.path}=${data.value}${data.force ? " (forced)" : ""}`); }
          json(res, { ok: true, applied: r.applied, file: L.rel, reason: r.reason });
        } catch (e) { json(res, { ok: false, applied: false, error: String(e) }, 500); }
      });
      return;
    }

    // Delete one or more elements by loc (bottom-to-top per file so locs stay valid).
    if (url === "/delete" && req.method === "POST") {
      readBody(req, (data, err) => {
        if (err || !data || !Array.isArray(data.locs)) {
          return json(res, { ok: false, error: "bad payload" }, 400);
        }
        try {
          const tags = Array.isArray(data.tags) ? data.tags : [];
          const byFile = new Map();
          data.locs.forEach((loc, i) => {
            const L = resolveLoc(loc);
            if (!L) return;
            L.tag = tags[i];
            if (!byFile.has(L.file)) byFile.set(L.file, []);
            byFile.get(L.file).push(L);
          });
          let deleted = 0, skipped = 0;
          for (const [file, locs] of byFile) {
            const prev = fs.readFileSync(file, "utf8");
            locs.sort((a, b) => b.line - a.line || b.col - a.col);
            for (const L of locs) {
              if (ast.removeElementByLoc(L.file, L.line, L.col, L.tag).applied) deleted++; else skipped++;
            }
            const next = fs.readFileSync(file, "utf8");
            if (next !== prev) pushUndo(file, prev, next);
          }
          console.log(`[annotate] deleted ${deleted} element(s), skipped ${skipped}`);
          json(res, { ok: true, deleted, skipped });
        } catch (e) { json(res, { ok: false, error: String(e) }, 500); }
      });
      return;
    }

    // Undo the most recent direct text edit (revert the file), if it's safe.
    if (url === "/undo" && req.method === "POST") {
      const entry = undoStack.pop();
      if (!entry) return res.end(JSON.stringify({ ok: true, undone: false, reason: "nothing to undo" }));
      try {
        const current = fs.existsSync(entry.file) ? fs.readFileSync(entry.file, "utf8") : null;
        if (current !== entry.postContent) {
          return res.end(JSON.stringify({ ok: true, undone: false, reason: "file changed since the edit" }));
        }
        fs.writeFileSync(entry.file, entry.prevContent);
        const rel = path.relative(TARGET_DIR, entry.file);
        console.log(`[annotate] undo -> ${rel}`);
        res.end(JSON.stringify({ ok: true, undone: true, file: rel, remaining: undoStack.length }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, undone: false, error: String(e) }));
      }
      return;
    }

    res.statusCode = 404;
    res.end("not found");
   } catch (e) {
    console.error("[annotate] request error:", e);
    try { res.statusCode = 500; res.end('{"ok":false,"error":"internal"}'); } catch {}
   }
  });

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.log(`[annotate] bridge already running on :${port}`);
      if (exitOnConflict) process.exit(0);
      return;
    }
    console.error("[annotate] bridge error:", e);
  });

  server.listen(port, () => {
    console.log(`[annotate] bridge on http://localhost:${port}  ->  ${ANN_FILE}`);
  });

  return server;
}

// CLI entry: `node bridge.mjs <project-dir>`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startBridge(process.argv[2], { exitOnConflict: true });
}
