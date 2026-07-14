/* Remotion Annotate — injectable overlay, Agentation-style look.
   Bookmarklet injects this on any localhost (e.g. Remotion Studio). */
(() => {
  // Port is injected at build time by the package (webpack DefinePlugin);
  // falls back to 7331 when used standalone.
  const BRIDGE = "http://localhost:" + (typeof __RA_PORT__ !== "undefined" ? __RA_PORT__ : 7331);
  if (window.__raToggle) return window.__raToggle();

  // ---------- inspection ----------
  const getDataLoc = (el) =>
    el.getAttribute?.("data-loc") || el.closest?.("[data-loc]")?.getAttribute("data-loc") || null;
  const getFiber = (n) => {
    const k = Object.keys(n).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
    return k ? n[k] : null;
  };
  const componentName = (n) => {
    let f = getFiber(n);
    while (f) {
      const t = f.type;
      if (typeof t === "function") return t.displayName || t.name || null;
      if (t && typeof t === "object") {
        if (t.displayName) return t.displayName;
        if (t.render?.name) return t.render.name;
      }
      f = f.return;
    }
    return null;
  };
  const cssPath = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 4) {
      let p = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(p + "#" + n.id); break; }
      const cls = [...n.classList].filter((c) => !c.startsWith("__")).slice(0, 2);
      if (cls.length) p += "." + cls.join(".");
      const par = n.parentElement;
      if (par) {
        const same = [...par.children].filter((c) => c.tagName === n.tagName);
        if (same.length > 1) p += `:nth-of-type(${same.indexOf(n) + 1})`;
      }
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(" > ");
  };
  const textSnip = (el) => {
    const t = (el.textContent || "").trim().replace(/\s+/g, " ");
    return t ? (t.length > 50 ? t.slice(0, 50) + "…" : t) : null;
  };
  const TAGNAME = { p: "paragraph", h1: "heading", h2: "heading", h3: "heading", h4: "heading",
    img: "image", a: "link", button: "button", span: "text", ul: "list", li: "item", svg: "icon" };
  const friendly = (el) => TAGNAME[el.tagName.toLowerCase()] || el.tagName.toLowerCase();
  const STYLE_KEYS = ["color", "backgroundColor", "fontSize", "fontWeight", "fontFamily",
    "width", "height", "padding", "margin", "borderRadius", "position", "display", "textAlign", "opacity"];
  const computed = (el) => {
    const cs = getComputedStyle(el); const o = {};
    STYLE_KEYS.forEach((k) => {
      const v = cs[k];
      if (v && !["normal", "auto", "0px", "rgba(0, 0, 0, 0)", "none", "static"].includes(v)) o[k] = v;
    });
    return o;
  };
  const chain = (el) => {
    const names = []; let f = getFiber(el);
    while (f && names.length < 5) {
      const t = f.type;
      const nm = typeof t === "function" ? (t.displayName || t.name)
        : (t && typeof t === "object" ? (t.displayName || t.render?.name) : null);
      if (nm && !names.includes(nm)) names.push(nm);
      f = f.return;
    }
    return names;
  };
  // Current Studio frame, read from the frame Remotion persists to localStorage.
  // Only updated while paused (fine for annotating); returns null if unavailable.
  const raFrame = () => {
    try {
      const all = JSON.parse(localStorage.getItem("remotion.time-all") || "{}");
      const comp = decodeURIComponent((location.pathname || "").replace(/^\//, ""));
      const f = comp in all ? all[comp] : Object.values(all)[0];
      return typeof f === "number" ? Math.round(f) : null;
    } catch {
      return null;
    }
  };
  const resolve = (el) => {
    const r = el.getBoundingClientRect();
    return { loc: getDataLoc(el), component: componentName(el), chain: chain(el),
      selector: cssPath(el), tag: el.tagName.toLowerCase(), text: textSnip(el), styles: computed(el),
      frame: raFrame(),
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } };
  };
  const mdFor = (a) => {
    if (a.kind === "region") {
      const R = a.target.region, L = [`### ${a.message}`, "", `- **Type:** canvas region (add/place something here)`];
      if (R) L.push(`- **Area:** x ${R.xPct}%, y ${R.yPct}%, width ${R.wPct}%, height ${R.hPct}% (of the content area)`);
      if (typeof a.target.frame === "number") L.push(`- **Frame:** ${a.target.frame}`);
      return L.join("\n");
    }
    if (a.kind === "timeRange") {
      return [`### ${a.message}`, "",
        `- **Type:** time range (applies to this span of the video)`,
        `- **Range:** frames ${a.target.frame}–${a.target.toFrame}`].join("\n");
    }
    if (a.kind === "multi") {
      const L = [`### ${a.message}`, "", `- **Type:** applies to ${a.targets?.length || 0} elements:`];
      (a.targets || []).forEach((t) => L.push(`  - \`${t.loc || t.selector}\`${t.text ? ` — "${t.text}"` : ""}`));
      if (typeof a.target.frame === "number") L.push(`- **Frame:** ${a.target.frame}`);
      return L.join("\n");
    }
    const t = a.target; const L = [`### ${a.message}`, ""];
    L.push(`- **Source:** \`${t.loc || t.selector}\``);
    if (typeof t.frame === "number") L.push(`- **Frame:** ${t.frame}`);
    if (t.chain?.length) L.push(`- **Components:** ${t.chain.join(" ◂ ")}`);
    L.push(`- **Element:** \`<${t.tag}>\`${t.text ? ` — "${t.text}"` : ""}`);
    L.push(`- **Selector:** \`${t.selector}\``);
    if (t.styles && Object.keys(t.styles).length)
      L.push(`- **Styles:** ${Object.entries(t.styles).map(([k, v]) => `${k}: ${v}`).join("; ")}`);
    return L.join("\n");
  };
  const toMarkdown = () => S.annotations.length
    ? `# Annotations (${S.annotations.length})\n\nApply each change at its **Source** location.\n\n` +
      S.annotations.map(mdFor).join("\n\n")
    : "";

  // ---------- state ----------
  const S = {
    open: false, active: false, hasLoc: false,
    hover: null, selected: null, annotations: [],
    settings: false, marker: "#3b82f6", clearOnSend: false, block: true, components: false,
    editPick: null, editOrig: "", propsPick: null,
    multi: [], multiPending: false, regionMode: false, regionDraw: null, regionPending: null,
    editAnnId: null, range: null, rangePending: null,
  };

  // ---------- shadow UI ----------
  const host = document.createElement("div");
  host.id = "__ra_host";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const ICONS = {
    pause: '<rect x="6" y="4" width="3.5" height="16" rx="1"/><rect x="14.5" y="4" width="3.5" height="16" rx="1"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7.6 19a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.09 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 5 7.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 5a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.91 10H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10H9"/>',
    key: '<path d="M12 3l7 9-7 9-7-9z"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    fab: '<path d="M3 6h13"/><path d="M3 12h8"/><path d="M3 18h11"/><path d="M19 13l1 2.5L22.5 17 20 18l-1 2.5L18 18l-2.5-1L18 15.5Z"/>',
  };
  const svg = (d, w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const tbtn = (id, d, title) => `<button class="ic" id="${id}" title="${title}">${svg(d)}</button>`;
  const sw = (c) => `<button class="sw" data-c="${c}" style="background:${c}"></button>`;

  root.innerHTML = `
  <style>
    *{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,sans-serif}
    :host{--mk:#3b82f6}
    .hl{position:fixed;border:1.5px solid var(--mk);border-radius:8px;background:color-mix(in srgb,var(--mk) 10%,transparent);pointer-events:none;transition:all 70ms ease-out}
    .tip{position:fixed;background:#1c1c1e;color:#fff;font-size:13px;font-weight:500;padding:7px 11px;border-radius:9px;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.4);white-space:nowrap;max-width:380px;overflow:hidden;text-overflow:ellipsis}
    .tip b{color:#9ca3af;font-weight:600}
    .plus,.pen{position:fixed;width:30px;height:30px;border-radius:50%;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,.35);line-height:1}
    .plus{background:var(--mk);font-size:18px}
    .pen{background:#111;font-size:13px}
    .pen:hover{background:#000}
    .panel{position:fixed;width:330px;background:#1c1c1e;border-radius:16px;padding:14px;pointer-events:auto;box-shadow:0 24px 60px rgba(0,0,0,.55);color:#e5e7eb}
    .crumb{display:flex;align-items:center;gap:6px;font-size:13px;color:#9ca3af;margin-bottom:10px}
    .crumb b{color:#d1d5db;font-weight:600}
    textarea{width:100%;height:64px;resize:none;border-radius:11px;border:1.5px solid #3a3a3c;background:#111;color:#fff;padding:10px;font-size:14px;outline:none}
    textarea:focus{border-color:var(--mk)}
    .einput{width:100%;border-radius:11px;border:1.5px solid #3a3a3c;background:#111;color:#fff;padding:10px 12px;font-size:15px;outline:none}
    .einput:focus{border-color:var(--mk)}
    .prow{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;align-items:center}
    .ghost{background:none;border:none;color:#9ca3af;font-size:14px;cursor:pointer;padding:8px 10px}
    .primary{background:var(--mk);border:none;color:#fff;font-size:14px;font-weight:600;padding:8px 18px;border-radius:10px;cursor:pointer}
    .bar{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:2px;background:#1c1c1e;border-radius:16px;padding:7px 9px;pointer-events:auto;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 16px 50px rgba(0,0,0,.5),0 0 0 4px color-mix(in srgb,var(--mk) 28%,transparent)}
    .ic{width:38px;height:38px;border:none;background:none;color:#a1a1a6;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer}
    .ic:hover{background:#2c2c2e;color:#fff}.ic.on{color:#fff;background:#2c2c2e}
    .sep{width:1px;height:22px;background:#3a3a3c;margin:0 4px}
    .fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;border-radius:50%;background:#111;color:#fff;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;box-shadow:0 10px 30px rgba(0,0,0,.45)}
    .fab:hover{background:#000}
    .set{position:fixed;bottom:78px;left:50%;transform:translateX(-50%);width:300px;background:#1c1c1e;border-radius:18px;padding:18px;pointer-events:auto;box-shadow:0 24px 60px rgba(0,0,0,.55);color:#e5e7eb}
    .set h4{margin:0 0 14px;font-family:'Brush Script MT',cursive;font-size:24px;font-weight:400;letter-spacing:.5px}
    .set .ver{float:right;font-family:Inter;font-size:12px;color:#6b7280;font-weight:500;margin-top:6px}
    .line{height:1px;background:#2c2c2e;margin:12px -18px}
    .opt{display:flex;align-items:center;justify-content:space-between;font-size:14px;color:#d1d5db;padding:6px 0}
    .sws{display:flex;gap:10px;margin-top:8px}
    .sw{width:26px;height:26px;border-radius:50%;border:2px solid transparent;cursor:pointer}
    .sw.on{border-color:#fff;box-shadow:0 0 0 2px var(--mk)}
    .chk{display:flex;align-items:center;gap:10px;font-size:14px;color:#d1d5db;padding:5px 0;cursor:pointer}
    .chk i{width:18px;height:18px;border-radius:5px;border:1.5px solid #4b4b4d;display:inline-block;flex:none}
    .chk.on i{background:var(--mk);border-color:var(--mk)}
    .tg{width:40px;height:23px;border-radius:12px;background:#3a3a3c;position:relative;cursor:pointer;flex:none}
    .tg::after{content:"";position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:50%;background:#fff;transition:.15s}
    .tg.on{background:var(--mk)}.tg.on::after{left:19px}
    .side{position:fixed;top:18px;right:18px;width:280px;max-height:64vh;overflow:auto;background:#1c1c1e;border-radius:14px;pointer-events:auto;color:#e5e7eb;box-shadow:0 16px 40px rgba(0,0,0,.45)}
    .side h3{margin:0;padding:12px 14px;font-size:13px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2c2c2e}
    .side h3 .clr{color:#9ca3af;cursor:pointer;font-size:12px}
    .item{padding:10px 14px;border-bottom:1px solid #232325;font-size:12px}
    .item .t{color:#9ca3af;font-size:11px}.item .m{color:#fff;margin-top:3px}
    .item .fr{color:var(--mk);cursor:pointer}.item .fr:hover{text-decoration:underline}
    .mhl{position:fixed;border:2px solid #22d3ee;border-radius:6px;background:rgba(34,211,238,.14);pointer-events:none}
    .rubber{position:fixed;border:2px dashed #f59e0b;border-radius:4px;background:rgba(245,158,11,.12);pointer-events:none}
    .mbar{position:fixed;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center;background:#1c1c1e;border:1px solid #232a36;border-radius:12px;padding:8px 12px;pointer-events:auto;box-shadow:0 12px 40px rgba(0,0,0,.5);color:#e5e7eb;font-size:13px}
    .mbar b{color:#22d3ee}
    .mbar .mb{border:1px solid #2a3343;background:#161c27;color:#cbd5e1;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px}
    .mbar .mb.del{background:#3b1113;border-color:#5b1a1d;color:#fca5a5}
    .mbar .mb:hover{filter:brightness(1.2)}
    .item .d{float:right;color:#6b7280;cursor:pointer}
    .item .e{float:right;color:#9ca3af;cursor:pointer;margin-right:10px}.item .e:hover{color:#fff}
    .toast{position:fixed;bottom:82px;left:50%;transform:translateX(-50%);background:#111;color:#fff;font-size:13px;font-weight:600;padding:9px 16px;border-radius:11px;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.5);border:1px solid #2c2c2e}
    .rchip{position:fixed;bottom:112px;left:50%;transform:translateX(-50%);z-index:45;background:#111;color:#f59e0b;font-size:13px;font-weight:700;font-family:ui-monospace,monospace;padding:8px 14px;border-radius:11px;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.5);border:1px solid #f59e0b55}
    .tband{position:fixed;background:rgba(245,158,11,.15);border:1.5px dashed #f59e0b;box-sizing:border-box;pointer-events:none;z-index:1}
    .dot{width:8px;height:8px;border-radius:50%;background:#ef4444;margin:0 4px;flex:none;box-shadow:0 0 6px #ef4444}
    .dot.on{background:#22c55e;box-shadow:0 0 6px #22c55e}
    .props{position:fixed;width:30px;height:30px;border-radius:50%;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,.35);background:#7c3aed}
    .props:hover{background:#6d28d9}
    .pp{width:330px;max-height:62vh;overflow:auto}
    .pp .pbody{margin-top:2px}
    .phdr{font-size:10px;color:#6b7280;margin:8px 0 3px;text-transform:uppercase;letter-spacing:.6px}
    .prow2{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px}
    .prow2 .k{width:90px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}
    .prow2 input[type=range]{flex:1;accent-color:var(--mk);min-width:0}
    .prow2 .num{width:52px;border-radius:7px;border:1px solid #3a3a3c;background:#111;color:#fff;padding:4px 6px;font-size:12px;flex:none}
    .prow2 select,.prow2 .txt{flex:1;min-width:0;border-radius:7px;border:1px solid #3a3a3c;background:#111;color:#fff;padding:5px 7px;font-size:12px}
    .prow2 input[type=color]{width:28px;height:24px;border:none;background:none;padding:0;flex:none;border-radius:6px}
    .prow2.off{opacity:.55}
    .prow2.off .why{flex:1;color:#6b7280;font-size:11px;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .prow2 .anot{color:var(--mk);cursor:pointer;font-size:11px;flex:none}
    .prow2 .anot.force{color:#f59e0b;margin-right:8px}
    .crumb{cursor:move;user-select:none}
    .hide{display:none!important}
  </style>
  <div class="hl hide" id="hl"></div>
  <div id="mhls"></div>
  <div class="rubber hide" id="rubber"></div>
  <div class="mbar hide" id="mbar"></div>
  <div class="tip hide" id="tip"></div>
  <button class="plus hide" id="plus">+</button>
  <button class="pen hide" id="pen" title="Edit text">✎</button>
  <button class="props hide" id="props" title="Edit props / styles">${svg(ICONS.sliders, 16)}</button>
  <div class="panel pp hide" id="ppanel">
    <div class="crumb"><b>Props</b>&nbsp;<span id="pcrumb"></span><span class="ghost" id="pclose" style="margin-left:auto;cursor:pointer">✕</span></div>
    <div class="pbody" id="pbody"></div>
  </div>
  <div class="panel hide" id="panel">
    <div class="crumb"><span id="crumb"></span></div>
    <textarea id="ta" placeholder="What should change?"></textarea>
    <div class="prow"><button class="ghost" id="cancel">Cancel</button><button class="primary" id="add">Add</button></div>
  </div>
  <div class="panel hide" id="epanel">
    <div class="crumb"><b>Edit text</b>&nbsp;<span id="ecrumb"></span></div>
    <input class="einput" id="eta" />
    <div class="prow"><button class="ghost" id="ecancel">Cancel</button><button class="primary" id="esave">Save (↵)</button></div>
  </div>
  <div class="side hide" id="side"><h3>Annotations <span class="clr" id="clr">Clear</span></h3><div id="list"></div></div>
  <div class="set hide" id="set">
    <h4>Annotations<span class="ver">v1.0</span></h4>
    <div class="line"></div>
    <div style="font-size:13px;color:#9ca3af;margin:6px 0">Marker Color</div>
    <div class="sws" id="sws">${["#6366f1","#3b82f6","#22d3ee","#22c55e","#eab308","#f97316","#ef4444"].map(sw).join("")}</div>
    <div class="line"></div>
    <div class="opt">React Components <div class="tg" id="tgComp"></div></div>
    <label class="chk on" id="chkBlock"><i></i> Block page interactions</label>
    <label class="chk" id="chkClear"><i></i> Clear on copy/send</label>
  </div>
  <div class="bar hide" id="bar">
    ${tbtn("bLayout", ICONS.layout, "Region mode (drag a box)")}
    ${tbtn("bRange", ICONS.key, "Time range: click to set start, move the playhead, click again (I/O)")}
    ${tbtn("bEye", ICONS.eye, "Show/hide marks")}
    ${tbtn("bUndo", ICONS.undo, "Undo last change (⌘Z)")}
    ${tbtn("bCopy", ICONS.copy, "Copy for agent")}
    ${tbtn("bTrash", ICONS.trash, "Clear")}
    ${tbtn("bGear", ICONS.gear, "Settings")}
    <span class="dot" id="dot" title="Bridge"></span>
    <div class="sep"></div>
    ${tbtn("bX", ICONS.x, "Close")}
  </div>
  <div class="toast hide" id="toast"></div>
  <div class="rchip hide" id="rchip"></div>
  <div class="tband hide" id="tband"></div>
  <button class="fab" id="fab" title="Annotate">${svg(ICONS.fab, 22)}</button>`;

  const $ = (id) => root.getElementById(id);
  root.host.style.setProperty("--mk", S.marker);

  // drag a panel by its header
  const makeDraggable = (panel, handle) => {
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button,input,select,textarea,.ghost,.anot")) return;
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = (ev) => {
        panel.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - ox)) + "px";
        panel.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - oy)) + "px";
      };
      const up = () => {
        document.removeEventListener("mousemove", move, true);
        document.removeEventListener("mouseup", up, true);
      };
      document.addEventListener("mousemove", move, true);
      document.addEventListener("mouseup", up, true);
    });
  };
  ["ppanel", "panel", "epanel"].forEach((id) => {
    const crumb = $(id).querySelector(".crumb");
    if (crumb) makeDraggable($(id), crumb);
  });

  // ---------- rendering ----------
  const place = (el, rect) => {
    el.style.left = rect.left + "px";
    el.style.top = rect.top + "px";
    el.style.width = rect.width + "px";
    el.style.height = rect.height + "px";
  };
  const isEditableText = (el) =>
    el.childNodes.length === 1 && el.firstChild && el.firstChild.nodeType === 3;
  const showHover = (pick) => {
    if (!pick || !S.active) {
      ["hl", "tip", "plus", "pen", "props"].forEach((id) => $(id).classList.add("hide"));
      return;
    }
    const r = pick.rect;
    $("hl").classList.remove("hide"); place($("hl"), r);
    const tip = $("tip"); tip.classList.remove("hide");
    const label = S.components && pick.info.component ? pick.info.component : friendly(pick.el);
    tip.innerHTML = `<b>${label}:</b> ${pick.info.text ? '"' + pick.info.text.replace(/</g, "&lt;") + '"' : pick.el.tagName.toLowerCase()}`;
    tip.style.left = Math.min(r.left, innerWidth - tip.offsetWidth - 12) + "px";
    tip.style.top = Math.max(8, r.top - 38) + "px";
    // lay out the action buttons centered on the element
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const buttons = ["plus"];
    if (pick.info.loc && isEditableText(pick.el)) buttons.push("pen"); else $("pen").classList.add("hide");
    if (pick.info.loc) buttons.push("props"); else $("props").classList.add("hide");
    const W = 30, G = 6, total = buttons.length * W + (buttons.length - 1) * G;
    let x = cx - total / 2;
    for (const id of buttons) {
      const b = $(id); b.classList.remove("hide");
      b.style.left = x + "px"; b.style.top = cy - 15 + "px";
      x += W + G;
    }
  };
  const openPanel = (pick) => {
    S.selected = pick;
    closeProps();
    ["plus", "pen", "props"].forEach((id) => $(id).classList.add("hide"));
    const p = $("panel"); p.classList.remove("hide");
    p.style.left = Math.min(pick.rect.left, innerWidth - 350) + "px";
    p.style.top = Math.min(pick.rect.top + pick.rect.height / 2, innerHeight - 200) + "px";
    $("crumb").innerHTML = `<b>${friendly(pick.el)}:</b> ${pick.info.loc ? pick.info.loc.split("/").pop() : '"' + (pick.info.text || "").slice(0, 28) + '…"'}`;
    $("ta").value = ""; setTimeout(() => $("ta").focus(), 0);
  };
  const closePanel = () => { S.selected = null; S.regionPending = null; S.multiPending = false; S.editAnnId = null; S.rangePending = null; stopBand(); $("panel").classList.add("hide"); };
  const renderList = () => {
    $("side").classList.toggle("hide", S.annotations.length === 0 || !S.open);
    $("list").innerHTML = S.annotations.map((a) => {
      const f = typeof a.target.frame === "number" ? a.target.frame : null;
      const to = typeof a.target.toFrame === "number" ? a.target.toFrame : null;
      const chip = f !== null ? `<span class="fr" data-frame="${f}" title="go to frame ${f}">◷ ${f}${to !== null ? "→" + to : ""}</span> · ` : "";
      return `<div class="item"><span class="d" data-id="${a.id}" title="delete">✕</span><span class="e" data-id="${a.id}" title="edit">✎</span>
        <div class="t">${chip}${a.target.loc ? a.target.loc.split("/").pop() : a.target.selector}</div>
        <div class="m">${a.message.replace(/</g, "&lt;")}</div></div>`;
    }).join("");
    $("list").querySelectorAll(".d").forEach((d) => d.onclick = () => {
      S.annotations = S.annotations.filter((a) => a.id !== d.dataset.id); renderList(); persist();
    });
    $("list").querySelectorAll(".e").forEach((e) => e.onclick = () => openEditAnnotation(e.dataset.id));
    $("list").querySelectorAll(".fr").forEach((f) => f.onclick = () => {
      if (window.__raSeek) window.__raSeek(Number(f.dataset.frame));
      else toast("seek unavailable");
    });
  };
  const openEditAnnotation = (id) => {
    const a = S.annotations.find((x) => x.id === id);
    if (!a) return;
    S.editAnnId = id;
    closeProps(); closeEdit();
    const p = $("panel"); p.classList.remove("hide");
    p.style.left = innerWidth / 2 - 165 + "px"; p.style.top = "80px";
    $("crumb").innerHTML = `<b>Edit annotation:</b> ${a.target.loc ? a.target.loc.split("/").pop() : a.target.selector}`;
    $("ta").value = a.message; setTimeout(() => { $("ta").focus(); $("ta").select(); }, 0);
  };

  // ---------- persistence ----------
  // POST helper that retries once on a network error (covers a brief bridge restart).
  const bpost = (pathname, payload, tries = 2) =>
    fetch(BRIDGE + pathname, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((r) => r.json())
      .catch((e) => {
        if (tries > 1) return new Promise((res) => setTimeout(res, 400)).then(() => bpost(pathname, payload, tries - 1));
        throw e;
      });
  const persist = () => fetch(BRIDGE + "/annotations", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: "1.0", composition: document.title, annotations: S.annotations }, null, 2) }).catch(() => {});
  fetch(BRIDGE + "/annotations").then((r) => r.json()).then((d) => { if (d?.annotations) { S.annotations = d.annotations; renderList(); } }).catch(() => {});

  // ---------- pointer ----------
  const pickFrom = (target) => {
    if (host.contains(target)) return undefined; // our UI: keep current
    if (S.hasLoc) return target.closest("[data-loc]") || null;
    return target;
  };
  let raf = 0;
  const onMove = (e) => {
    if (!S.active || S.selected || S.editPick || S.propsPick || S.regionMode) return;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = pickFrom(e.target);
      if (el === undefined) return;          // over our UI, keep
      if (!el) return;                       // empty area, keep last
      if (S.hover && S.hover.el === el) return;
      S.hover = { el, rect: el.getBoundingClientRect(), info: resolve(el) };
      showHover(S.hover);
    });
  };
  const onClick = (e) => {
    if (!S.active || S.editPick || S.propsPick || S.regionMode) return; // region uses drag; panels block clicks
    const el = pickFrom(e.target);
    if (el === undefined || !el) return;
    if (S.block) { e.preventDefault(); e.stopPropagation(); }
    const pick = { el, rect: el.getBoundingClientRect(), info: resolve(el) };
    if (e.shiftKey && pick.info.loc) { toggleMulti(pick); return; } // shift-click = multi-select
    S.hover = pick;
    showHover(S.hover);
    openPanel(S.hover);
  };
  const add = () => {
    const msg = $("ta").value.trim();
    if (!msg) return;
    if (S.editAnnId) {
      const a = S.annotations.find((x) => x.id === S.editAnnId);
      if (a) a.message = msg;
      renderList(); persist(); closePanel(); return;
    }
    if (S.rangePending) {
      S.annotations.push({ id: "a" + Date.now().toString(36), kind: "timeRange", createdAt: Date.now(), message: msg,
        target: { loc: null, selector: `frames ${S.rangePending.from}-${S.rangePending.to}`, tag: "range", frame: S.rangePending.from, toFrame: S.rangePending.to } });
      renderList(); persist(); closePanel(); return;
    }
    if (S.regionPending) {
      S.annotations.push({ id: "a" + Date.now().toString(36), kind: "region", createdAt: Date.now(), message: msg,
        target: { region: S.regionPending.rect, viewport: S.regionPending.viewport, frame: S.regionPending.frame, loc: null, selector: "(region)", tag: "region" } });
      renderList(); persist(); closePanel(); return;
    }
    if (S.multiPending) {
      S.annotations.push({ id: "a" + Date.now().toString(36), kind: "multi", createdAt: Date.now(), message: msg,
        targets: S.multi.map((p) => p.info), target: { loc: null, selector: `${S.multi.length} elements`, tag: "multi", frame: raFrame() } });
      renderList(); persist(); closePanel(); clearMulti(); return;
    }
    if (!S.selected) return;
    S.annotations.push({ id: "a" + Date.now().toString(36), kind: "feedback", createdAt: Date.now(),
      message: msg, target: S.selected.info });
    renderList(); persist(); closePanel();
  };

  // ---------- multi-select (shift-click) ----------
  const renderMulti = () => {
    $("mhls").innerHTML = S.multi.map((p) => {
      const r = p.el.getBoundingClientRect();
      return `<div class="mhl" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div>`;
    }).join("");
    const bar = $("mbar");
    if (S.multi.length && S.open) {
      bar.classList.remove("hide");
      bar.innerHTML = `<b>${S.multi.length}</b> selected <button class="mb" id="mAnot">Annotate</button><button class="mb del" id="mDel">Delete</button><button class="mb" id="mClr">✕</button>`;
      $("mAnot").onclick = () => { S.multiPending = true; openMultiPanel(); };
      $("mDel").onclick = deleteMulti;
      $("mClr").onclick = clearMulti;
    } else { bar.classList.add("hide"); bar.innerHTML = ""; }
  };
  const toggleMulti = (pick) => {
    const key = pick.info.loc || pick.info.selector;
    const i = S.multi.findIndex((p) => (p.info.loc || p.info.selector) === key);
    if (i >= 0) S.multi.splice(i, 1); else S.multi.push(pick);
    showHover(null); renderMulti();
  };
  const clearMulti = () => { S.multi = []; S.multiPending = false; renderMulti(); };
  const openMultiPanel = () => {
    const p = $("panel"); p.classList.remove("hide");
    p.style.left = innerWidth / 2 - 165 + "px"; p.style.top = "64px";
    $("crumb").innerHTML = `<b>${S.multi.length} elements:</b> one instruction for all`;
    $("ta").value = ""; setTimeout(() => $("ta").focus(), 0);
  };
  const deleteMulti = () => {
    const locs = S.multi.map((p) => p.info.loc).filter(Boolean);
    const tags = S.multi.filter((p) => p.info.loc).map((p) => p.info.tag);
    if (!locs.length) return toast("no locs to delete");
    bpost("/delete", { locs, tags })
      .then((d) => toast(`Deleted ${d.deleted}${d.skipped ? ` (${d.skipped} skipped)` : ""} ✓ · ⌘Z`))
      .catch(() => toast("Bridge offline"));
    clearMulti();
  };

  // ---------- region annotation (drag a box on the canvas) ----------
  const findCanvasRect = () => {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const el of document.querySelectorAll("[data-loc]")) {
      const q = el.getBoundingClientRect();
      if (q.width < 2 || q.height < 2) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
    return l === Infinity ? null : { left: l, top: t, width: r - l, height: b - t };
  };
  const setRegionMode = (v) => {
    S.regionMode = v;
    $("bLayout").classList.toggle("on", v);
    showHover(null);
    if (!v) { $("rubber").classList.add("hide"); S.regionDraw = null; }
    toast(v ? "Region mode: drag a box" : "");
  };
  const onRegionDown = (e) => {
    if (!S.active || !S.regionMode || host.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    S.regionDraw = { x0: e.clientX, y0: e.clientY };
  };
  const onRegionMove = (e) => {
    if (!S.regionDraw) return;
    const d = S.regionDraw;
    const x = Math.min(d.x0, e.clientX), y = Math.min(d.y0, e.clientY);
    const w = Math.abs(e.clientX - d.x0), h = Math.abs(e.clientY - d.y0);
    const rb = $("rubber"); rb.classList.remove("hide");
    rb.style.left = x + "px"; rb.style.top = y + "px"; rb.style.width = w + "px"; rb.style.height = h + "px";
  };
  const onRegionUp = (e) => {
    if (!S.regionDraw) return;
    const d = S.regionDraw; S.regionDraw = null;
    $("rubber").classList.add("hide");
    const x = Math.min(d.x0, e.clientX), y = Math.min(d.y0, e.clientY);
    const w = Math.abs(e.clientX - d.x0), h = Math.abs(e.clientY - d.y0);
    if (w < 6 || h < 6) return;
    const cv = findCanvasRect();
    const pct = cv ? {
      xPct: +(((x - cv.left) / cv.width) * 100).toFixed(1),
      yPct: +(((y - cv.top) / cv.height) * 100).toFixed(1),
      wPct: +((w / cv.width) * 100).toFixed(1),
      hPct: +((h / cv.height) * 100).toFixed(1),
    } : null;
    S.regionPending = { rect: pct, frame: raFrame(), viewport: { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) } };
    const p = $("panel"); p.classList.remove("hide");
    p.style.left = Math.min(x, innerWidth - 350) + "px";
    p.style.top = Math.min(y + h + 8, innerHeight - 190) + "px";
    $("crumb").innerHTML = `<b>Region${pct ? ` (${pct.xPct}%, ${pct.yPct}%)` : ""}:</b> what goes here?`;
    $("ta").value = ""; setTimeout(() => $("ta").focus(), 0);
  };

  // ---------- inline text edit (own input, no contentEditable — avoids React re-render eating keystrokes) ----------
  const openEdit = (pick) => {
    if (!pick?.info.loc || !isEditableText(pick.el)) return;
    S.editPick = pick; S.editOrig = pick.el.textContent;
    closePanel(); closeProps(); showHover(null);
    const p = $("epanel"); p.classList.remove("hide");
    p.style.left = Math.min(pick.rect.left, innerWidth - 360) + "px";
    p.style.top = Math.min(pick.rect.bottom + 8, innerHeight - 160) + "px";
    $("ecrumb").textContent = pick.info.loc.split("/").pop();
    const inp = $("eta"); inp.value = pick.el.textContent;
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  };
  const closeEdit = () => { S.editPick = null; $("epanel").classList.add("hide"); };
  const norm = (s) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
  const saveEdit = () => {
    const pick = S.editPick; if (!pick) return;
    const oldText = S.editOrig, loc = pick.info.loc;
    const newText = norm($("eta").value);
    closeEdit();
    S.hover = null; // text edit shifts lines: force a fresh hover before the next action
    if (!newText) return toast("Empty text, not saved");
    if (newText === norm(oldText)) return; // unchanged
    bpost("/edit", { loc, oldText, newText, tag: pick.info.tag })
      .then((d) => toast(d.applied ? "Text changed ✓ · ⌘Z to undo" : "Exact text not found in source"))
      .catch(() => toast("Bridge offline, not saved"));
  };

  // ---------- visual prop editor ----------
  const toHexInput = (v) => {
    if (typeof v !== "string") return "#000000";
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    if (/^#[0-9a-f]{3}$/i.test(v)) return "#" + v.slice(1).split("").map((c) => c + c).join("");
    const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return "#" + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, "0")).join("");
    return "#000000";
  };
  const numRange = (v) => {
    const av = Math.abs(v);
    if (av > 0 && av <= 2 && !Number.isInteger(v)) return { min: 0, max: 1, step: 0.01 };
    const max = Math.max(100, Math.ceil(av * 3));
    return { min: Math.min(0, v), max, step: 1 };
  };
  const escAttr = (s) => String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
  // shared control markup + behavior (editable rows and forced rows reuse it)
  const controlInner = (type, value, options) => {
    if (type === "number") {
      const n = Number(value) || 0, r = numRange(n);
      return `<input type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${n}"><input class="num" type="number" step="${r.step}" value="${n}">`;
    }
    if (type === "color") return `<input type="color" value="${toHexInput(value)}"><input class="txt" type="text" value="${escAttr(value)}">`;
    if (type === "enum") return `<select>${(options || []).map((o) => `<option ${o === String(value) ? "selected" : ""}>${o}</option>`).join("")}</select>`;
    return `<input class="txt" type="text" value="${escAttr(value)}">`;
  };
  const attachControl = (row, type, write) => {
    if (type === "number") {
      const rng = row.querySelector('input[type=range]'), num = row.querySelector(".num");
      rng.oninput = () => { num.value = rng.value; };
      rng.onchange = () => write(Number(rng.value));
      num.onchange = () => { rng.value = num.value; write(Number(num.value)); };
    } else if (type === "color") {
      const col = row.querySelector('input[type=color]'), txt = row.querySelector(".txt");
      col.oninput = () => { txt.value = col.value; };
      col.onchange = () => write(col.value);
      txt.onchange = () => write(txt.value);
    } else if (type === "enum") {
      row.querySelector("select").onchange = (e) => write(e.target.value);
    } else {
      row.querySelector(".txt").onchange = (e) => write(e.target.value);
    }
  };
  const rowEditable = (a) =>
    `<div class="prow2" data-path="${a.path}" data-type="${a.type}"><span class="k" title="${a.key}">${a.key}</span>${controlInner(a.type, a.value, a.options)}</div>`;
  const rowOff = (a) => {
    const force = a.forceType
      ? `<span class="anot force" data-k="${a.key}" data-path="${a.path}" data-type="${a.forceType}"${a.options ? ` data-opts="${a.options.join(",")}"` : ""} title="replaces the expression with a fixed value">force</span>`
      : "";
    return `<div class="prow2 off"><span class="k" title="${a.key}">${a.key}</span><span class="why">${a.reason || ""}</span>${force}<span class="anot" data-k="${a.key}">annotate</span></div>`;
  };

  const renderProps = (data, pick) => {
    const body = $("pbody");
    if (!data.found) { body.innerHTML = '<div class="phdr">element not found in source</div>'; return; }
    const styles = pick.info.styles || {};
    const ed = data.attrs.filter((a) => a.editable);
    const off = data.attrs.filter((a) => !a.editable);
    let html = "";
    if (ed.length) html += '<div class="phdr">Editable</div>' + ed.map(rowEditable).join("");
    else html += '<div class="phdr">no static editable props</div>';
    if (off.length) html += '<div class="phdr">No editable</div>' + off.map(rowOff).join("");
    body.innerHTML = html;
    const writer = (path, extra) => (value) =>
      bpost("/prop", { loc: pick.info.loc, path, value, tag: pick.info.tag, ...(extra || {}) })
        .then((d) => toast(d.applied ? "Prop updated ✓ · ⌘Z to undo" : (d.reason || "not applied")))
        .catch(() => toast("Bridge offline"));
    body.querySelectorAll(".prow2[data-path]").forEach((row) => attachControl(row, row.dataset.type, writer(row.dataset.path)));
    // "force": opt-in replace a dynamic value (variable/animation) with a fixed literal
    body.querySelectorAll(".anot.force").forEach((f) => f.onclick = () => {
      const row = f.closest(".prow2");
      const { k: key, path, type } = f.dataset;
      const options = f.dataset.opts ? f.dataset.opts.split(",") : null;
      const cur = styles[key];
      const def = cur != null ? (type === "number" ? parseFloat(cur) || 0 : cur)
        : (type === "number" ? 0 : type === "color" ? "#ffffff" : type === "enum" ? (options && options[0]) || "" : "");
      row.classList.remove("off");
      row.innerHTML = `<span class="k" title="${key}">${key}</span>${controlInner(type, def, options)}`;
      attachControl(row, type, writer(path, { force: true, kind: type }));
      const first = row.querySelector("input,select"); if (first) first.focus();
    });
    body.querySelectorAll(".anot:not(.force)").forEach((a) => a.onclick = () => {
      closeProps(); openPanel(pick); $("ta").value = a.dataset.k + ": ";
    });
  };
  const openProps = (pick) => {
    if (!pick?.info.loc) return;
    S.propsPick = pick;
    closePanel(); closeEdit(); showHover(null);
    const p = $("ppanel"); p.classList.remove("hide");
    p.style.left = Math.min(pick.rect.left, innerWidth - 350) + "px";
    p.style.top = Math.min(Math.max(12, pick.rect.top), innerHeight - 360) + "px";
    $("pcrumb").textContent = pick.info.loc.split("/").pop();
    $("pbody").innerHTML = '<div class="phdr">loading…</div>';
    fetch(BRIDGE + "/element?loc=" + encodeURIComponent(pick.info.loc) + "&tag=" + encodeURIComponent(pick.info.tag || ""))
      .then((r) => r.json())
      .then((d) => { if (S.propsPick === pick) renderProps(d, pick); })
      .catch(() => { $("pbody").innerHTML = '<div class="phdr">bridge offline</div>'; });
  };
  const closeProps = () => { S.propsPick = null; $("ppanel").classList.add("hide"); };

  // ---------- wiring ----------
  $("plus").onclick = () => S.hover && openPanel(S.hover);
  $("pen").onclick = () => S.hover && openEdit(S.hover);
  $("props").onclick = () => S.hover && openProps(S.hover);
  $("pclose").onclick = closeProps;
  $("esave").onclick = saveEdit;
  $("ecancel").onclick = closeEdit;
  $("add").onclick = add;
  $("cancel").onclick = closePanel;
  $("clr").onclick = () => { S.annotations = []; renderList(); persist(); };

  const setActive = (v) => { S.active = v; if (!v) showHover(null); };
  $("bEye").onclick = () => { const h = $("hl"); h.style.visibility = h.style.visibility === "hidden" ? "" : "hidden"; $("tip").style.visibility = h.style.visibility; };
  let toastT = 0;
  const toast = (msg) => {
    const t = $("toast"); t.textContent = msg; t.classList.remove("hide");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hide"), 1800);
  };
  const doUndo = () => {
    bpost("/undo", {})
      .then((d) => toast(d.undone ? `Change undone ✓ (${d.file})` : (d.reason || "Nothing to undo")))
      .catch(() => toast("Bridge offline"));
  };
  $("bCopy").onclick = () => {
    if (!S.annotations.length) return toast("No annotations");
    const md = toMarkdown();
    persist();
    navigator.clipboard?.writeText(md)
      .then(() => toast(`Markdown copied (${S.annotations.length}) — paste to your agent`))
      .catch(() => toast("Copy failed"));
    if (S.clearOnSend) { S.annotations = []; renderList(); persist(); }
  };
  $("bUndo").onclick = doUndo;
  $("bTrash").onclick = () => { S.annotations = []; renderList(); persist(); };
  $("bGear").onclick = () => { S.settings = !S.settings; $("set").classList.toggle("hide", !S.settings); };
  $("bLayout").onclick = () => setRegionMode(!S.regionMode);

  // ---------- time-range annotation (keyframe-style: mark start, scrub Studio's
  // own timeline, mark end) ----------
  // Amber band drawn over Studio's REAL timeline while marking a range.
  // Anchored to Studio's playhead line (1px, #f02c00) in content-space, so it
  // survives timeline scrolling; zoom changes are rebased via scrollWidth.
  let bandRAF = 0, bandCal = null; // { scrollEl, xA, sw0, frozen }
  const findPlayhead = () => {
    for (const d of document.querySelectorAll("div")) {
      const s = d.style;
      if (s && s.position === "fixed" && s.width === "1px" &&
        (s.backgroundColor === "rgb(240, 44, 0)" || s.backgroundColor === "#f02c00")) {
        return d.parentElement;
      }
    }
    return null;
  };
  const contentX = (el, scrollEl) =>
    el.getBoundingClientRect().left - scrollEl.getBoundingClientRect().left + scrollEl.scrollLeft;
  const startBand = () => {
    const ph = findPlayhead();
    const scrollEl = ph && ph.closest(".__remotion-horizontal-scrollbar");
    if (!ph || !scrollEl) { bandCal = null; return; } // not Studio / timeline hidden: chip only
    bandCal = { scrollEl, xA: contentX(ph, scrollEl), sw0: scrollEl.scrollWidth, frozen: null };
    const band = $("tband");
    const PAD = 16; // Studio's TIMELINE_PADDING
    const loop = () => {
      if (!bandCal) return;
      const sEl = bandCal.scrollEl;
      const sw = sEl.scrollWidth;
      if (sw !== bandCal.sw0 && bandCal.sw0 > 32) { // zoom rebase
        const k = (sw - PAD * 2) / (bandCal.sw0 - PAD * 2);
        bandCal.xA = PAD + (bandCal.xA - PAD) * k;
        if (bandCal.frozen != null) bandCal.frozen = PAD + (bandCal.frozen - PAD) * k;
        bandCal.sw0 = sw;
      }
      let xB = bandCal.frozen;
      if (xB == null) {
        const phNow = findPlayhead();
        xB = phNow ? contentX(phNow, sEl) : bandCal.xA;
      }
      const r = sEl.getBoundingClientRect();
      const v1 = r.left + Math.min(bandCal.xA, xB) - sEl.scrollLeft;
      const v2 = r.left + Math.max(bandCal.xA, xB) - sEl.scrollLeft;
      const left = Math.max(v1, r.left), right = Math.min(v2, r.right);
      if (right - left > 0.5) {
        band.classList.remove("hide");
        band.style.left = left + "px";
        band.style.width = right - left + "px";
        band.style.top = r.top + "px";
        band.style.height = r.height + "px";
      } else {
        band.classList.add("hide");
      }
      bandRAF = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(bandRAF);
    loop();
  };
  const freezeBand = () => {
    if (!bandCal) return;
    const ph = findPlayhead();
    if (ph) bandCal.frozen = contentX(ph, bandCal.scrollEl);
  };
  const stopBand = () => {
    bandCal = null;
    cancelAnimationFrame(bandRAF);
    $("tband").classList.add("hide");
  };

  let rangeTimer = 0;
  const armRange = () => {
    const f = raFrame();
    if (f == null) return toast("Frame unavailable — move the playhead first");
    S.range = { from: f };
    startBand();
    $("bRange").classList.add("on");
    const chip = $("rchip");
    chip.classList.remove("hide");
    const tick = () => {
      const c = raFrame();
      chip.textContent = `◆ ${S.range.from} → ${c ?? "…"}`;
    };
    tick();
    clearInterval(rangeTimer);
    rangeTimer = setInterval(tick, 250);
    toast("Range start set · move the playhead, then click ◆ again (or press O)");
  };
  const cancelRange = () => {
    S.range = null;
    clearInterval(rangeTimer);
    $("bRange").classList.remove("on");
    $("rchip").classList.add("hide");
  };
  const completeRange = () => {
    if (!S.range) return;
    const to = raFrame();
    if (to == null) return toast("Frame unavailable");
    let a = S.range.from, b = to;
    if (b < a) [a, b] = [b, a];
    freezeBand(); // keep the amber band on the timeline while the panel is open
    cancelRange();
    closePanel(); closeProps(); closeEdit();
    S.rangePending = { from: a, to: b };
    const p = $("panel");
    p.classList.remove("hide");
    p.style.left = innerWidth / 2 - 165 + "px";
    p.style.top = "80px";
    $("crumb").innerHTML = `<b>Range:</b> frames ${a} → ${b}`;
    $("ta").value = "";
    setTimeout(() => $("ta").focus(), 0);
  };
  $("bRange").onclick = () => (S.range ? completeRange() : armRange());

  $("bX").onclick = () => toggleOpen(false);

  $("sws").querySelectorAll(".sw").forEach((b) => b.onclick = () => {
    S.marker = b.dataset.c; root.host.style.setProperty("--mk", S.marker);
    $("sws").querySelectorAll(".sw").forEach((x) => x.classList.toggle("on", x === b));
  });
  $("sws").querySelector('[data-c="#3b82f6"]').classList.add("on");
  $("tgComp").onclick = () => { S.components = !S.components; $("tgComp").classList.toggle("on", S.components); };
  $("chkBlock").onclick = () => { S.block = !S.block; $("chkBlock").classList.toggle("on", S.block); };
  $("chkClear").onclick = () => { S.clearOnSend = !S.clearOnSend; $("chkClear").classList.toggle("on", S.clearOnSend); };

  const toggleOpen = (v) => {
    S.open = v;
    $("bar").classList.toggle("hide", !v);
    $("fab").classList.toggle("hide", v);
    $("set").classList.add("hide"); S.settings = false;
    setActive(v);
    if (!v) { closePanel(); closeEdit(); closeProps(); clearMulti(); setRegionMode(false); cancelRange(); showHover(null); }
    renderList();
  };
  $("fab").onclick = () => { S.hasLoc = !!document.querySelector("[data-loc]"); toggleOpen(true); };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("mousedown", onRegionDown, true);
  document.addEventListener("mousemove", onRegionMove, true);
  document.addEventListener("mouseup", onRegionUp, true);

  // Keyboard isolation: keystrokes typed in our UI (or while editing inline) must
  // NOT reach Studio's global shortcuts. Our entry runs before Studio, so this
  // window-capture listener fires first and stops the event there.
  const keySource = (e) => {
    const path = e.composedPath ? e.composedPath() : [];
    return path.includes(host) || host.contains(e.target) ? "ui" : null;
  };
  const keyGuard = (e) => {
    const src = keySource(e);
    if (src) {
      e.stopImmediatePropagation(); // shield the keystroke from Studio
      if (e.type !== "keydown" || e.isComposing || e.keyCode === 229) return; // let IME compose
      if (S.editPick) {
        if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
        else if (e.key === "Escape") { e.preventDefault(); closeEdit(); }
      } else if (S.propsPick) {
        if (e.key === "Escape") { e.preventDefault(); closeProps(); }
      } else {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); }
        else if (e.key === "Escape") closePanel();
      }
      return;
    }
    if (e.type !== "keydown") return;
    // undo (only while open) — handled before the modifier/field bail-out below
    if (S.open && (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.stopImmediatePropagation(); e.preventDefault(); doUndo(); return;
    }
    // never hijack keys with a modifier held (Cmd+A etc.) or while typing in a Studio field
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || /^(input|textarea|select)$/i.test(ae.tagName))) return;
    if (e.key.toLowerCase() === "a" && !e.repeat) {
      e.stopImmediatePropagation(); S.open ? toggleOpen(false) : $("fab").click();
    } else if (S.open && e.key.toLowerCase() === "i" && !e.repeat) {
      e.stopImmediatePropagation(); armRange(); // set (or reset) range start, editor-style
    } else if (S.open && e.key.toLowerCase() === "o" && !e.repeat) {
      e.stopImmediatePropagation(); if (S.range) completeRange();
    } else if (e.key === "Escape" && S.open) {
      e.stopImmediatePropagation();
      if (S.range) { cancelRange(); stopBand(); }
      else if (S.selected) closePanel();
      else toggleOpen(false);
    }
  };
  ["keydown", "keyup", "keypress"].forEach((t) => window.addEventListener(t, keyGuard, true));

  // bridge health indicator (green = connected, red = offline)
  const setBridge = (ok) => {
    const d = $("dot");
    d.classList.toggle("on", ok);
    d.title = ok ? "Bridge connected" : "Bridge disconnected — run: ANNOTATE=1 npx remotion studio";
  };
  const ping = () => fetch(BRIDGE + "/annotations", { method: "GET" })
    .then((r) => setBridge(r.ok)).catch(() => setBridge(false));
  ping();
  setInterval(ping, 4000);

  window.__raToggle = () => (S.open ? toggleOpen(false) : toggleOpen(true));
  console.log("[Remotion Annotate] ready — click the FAB (bottom-right) or press A.");
})();
