// AST helpers for the Remotion Annotate bridge.
// Given a data-loc (file:line:col, where line/col are babel loc.start of the JSX
// opening element), find that element in the source and edit it surgically.
// Edits are character-range splices using node.start/node.end, so the rest of the
// file stays byte-identical (no reformatting / no generator pass).
import { parseSync } from "@babel/core";
import _traverse from "@babel/traverse";
import fs from "node:fs";

const traverse = _traverse.default || _traverse;

export function parseFile(code, filename) {
  return parseSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ["jsx", "typescript"] },
  });
}

function findOpening(ast, line, col, tag) {
  let found = null;
  traverse(ast, {
    JSXOpeningElement(path) {
      const s = path.node.loc && path.node.loc.start;
      if (s && s.line === line && s.column === col) {
        // tag guard: if the caller knows the expected tag, reject a same-coord
        // element of a different tag (mitigates stale coords after a line shift).
        const nm = path.node.name;
        if (tag && nm && nm.type === "JSXIdentifier" && nm.name !== tag) return;
        found = path;
        path.stop();
      }
    },
  });
  return found;
}

// ---- classification ----
const COLOR_KEYS = new Set([
  "color", "backgroundColor", "background", "borderColor", "outlineColor",
  "fill", "stroke", "caretColor", "textDecorationColor", "boxShadow",
]);
const ENUM_OPTS = {
  textAlign: ["left", "center", "right", "justify"],
  position: ["static", "relative", "absolute", "fixed", "sticky"],
  display: ["block", "flex", "inline", "inline-block", "grid", "none"],
  fontWeight: ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"],
  justifyContent: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
  alignItems: ["flex-start", "center", "flex-end", "stretch", "baseline"],
  flexDirection: ["row", "column", "row-reverse", "column-reverse"],
  objectFit: ["fill", "contain", "cover", "none", "scale-down"],
  textTransform: ["none", "uppercase", "lowercase", "capitalize"],
};
const NAMED_COLORS = new Set([
  "white", "black", "red", "green", "blue", "yellow", "orange", "purple", "pink",
  "gray", "grey", "transparent", "cyan", "magenta", "gold", "silver",
]);
// numeric CSS-ish keys, used to infer the control type when force-editing a
// non-literal value (variable/animated) into a fixed literal.
const NUM_KEYS = new Set([
  "fontSize", "fontWeight", "opacity", "lineHeight", "letterSpacing", "width", "height",
  "top", "left", "right", "bottom", "margin", "marginTop", "marginBottom", "marginLeft",
  "marginRight", "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
  "borderRadius", "borderWidth", "gap", "zIndex", "flex", "order", "rotate", "scale",
  "x", "y", "size", "strokeWidth", "maxWidth", "maxHeight", "minWidth", "minHeight",
]);
// attributes that must never be force-rewritten to a literal.
const NO_FORCE = new Set(["key", "ref", "children", "dangerouslySetInnerHTML"]);
const forceTypeFor = (key) =>
  ENUM_OPTS[key] ? "enum" : (COLOR_KEYS.has(key) || /color$/i.test(key)) ? "color"
    : NUM_KEYS.has(key) ? "number" : "string";
function looksColor(v) {
  return typeof v === "string" &&
    (/^#([0-9a-f]{3,8})$/i.test(v) || /^(rgb|hsl)a?\(/i.test(v) || NAMED_COLORS.has(v.toLowerCase()));
}

const isNegNumber = (n) =>
  n && n.type === "UnaryExpression" && n.operator === "-" && n.argument && n.argument.type === "NumericLiteral";

function describe(path, key, node) {
  if (!node) return { key, path, editable: false, reason: "no value" };
  if (node.type === "NumericLiteral") {
    // color: 0xff0000 is a number we can't safely color-pick; leave it alone.
    if (COLOR_KEYS.has(key)) return { key, path, editable: false, reason: "numeric color (hex int)" };
    return { key, path, editable: true, type: "number", value: node.value };
  }
  if (isNegNumber(node)) return { key, path, editable: true, type: "number", value: -node.argument.value };
  if (node.type === "StringLiteral") {
    // only offer a color picker when the value actually looks like a color
    // (so background: "linear-gradient(...)" stays a string, not a color).
    const type = ENUM_OPTS[key] ? "enum" : looksColor(node.value) ? "color" : "string";
    const out = { key, path, editable: true, type, value: node.value };
    if (ENUM_OPTS[key]) out.options = ENUM_OPTS[key];
    return out;
  }
  const reason =
    node.type === "Identifier" || node.type === "MemberExpression" ? "constant or variable"
      : node.type === "TemplateLiteral" ? "dynamic value (template)"
      : node.type === "CallExpression" ? "animated (interpolate/spring)"
      : node.type === "ConditionalExpression" ? "conditional"
      : node.type;
  const out = { key, path, editable: false, reason };
  // a single value node we could force-replace with a literal (user opt-in)
  if (!NO_FORCE.has(key)) {
    out.forceType = forceTypeFor(key);
    if (ENUM_OPTS[key]) out.options = ENUM_OPTS[key];
  }
  return out;
}

/** Return the classified attribute list for the element at line:col. */
export function classify(file, line, col, tag) {
  const code = fs.readFileSync(file, "utf8");
  const ast = parseFile(code, file);
  const elPath = findOpening(ast, line, col, tag);
  if (!elPath) return { found: false, tag: null, attrs: [] };
  const elTag = elPath.node.name && elPath.node.name.name;
  const attrs = [];
  for (const attr of elPath.node.attributes) {
    if (attr.type === "JSXSpreadAttribute") {
      attrs.push({ key: "(spread)", editable: false, reason: "spread props" });
      continue;
    }
    if (attr.type !== "JSXAttribute") continue;
    if (attr.name.type !== "JSXIdentifier") {
      attrs.push({ key: "(namespaced)", editable: false, reason: "namespaced attribute" });
      continue;
    }
    const name = attr.name.name;
    const v = attr.value;
    if (name === "style" && v && v.type === "JSXExpressionContainer" && v.expression.type === "ObjectExpression") {
      const seen = new Set();
      for (const prop of v.expression.properties) {
        if (prop.type !== "ObjectProperty") {
          attrs.push({ key: "style.(spread)", editable: false, reason: "spread" });
          continue;
        }
        if (prop.computed) {
          attrs.push({ key: "style.[computed]", editable: false, reason: "computed key" });
          continue;
        }
        const k = prop.key.type === "Identifier" ? prop.key.name
          : prop.key.type === "StringLiteral" ? prop.key.value : null;
        if (!k) { attrs.push({ key: "style.[?]", editable: false, reason: "non-literal key" }); continue; }
        if (seen.has(k)) { attrs.push({ key: "style." + k, editable: false, reason: "duplicate key" }); continue; }
        seen.add(k);
        attrs.push(describe("style." + k, k, prop.value));
      }
      continue;
    }
    let valNode = null;
    if (v == null) { attrs.push({ key: name, path: name, editable: false, reason: "boolean" }); continue; }
    if (v.type === "StringLiteral") valNode = v;
    else if (v.type === "JSXExpressionContainer") valNode = v.expression;
    attrs.push(describe(name, name, valNode));
  }
  return { found: true, tag: elTag, attrs };
}

// ---- editing (surgical string splice) ----
// returns { node, jsxAttr } where jsxAttr=true means the node is a direct JSX
// attribute value (className="x") and must be re-serialized as a JSX string, not JS.
function locateValueNode(openingEl, attrPath) {
  const parts = attrPath.split(".");
  const attr = openingEl.attributes.find(
    (a) => a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === parts[0],
  );
  if (!attr) return null;
  if (parts.length === 1) {
    if (attr.value && attr.value.type === "StringLiteral") return { node: attr.value, jsxAttr: true };
    if (attr.value && attr.value.type === "JSXExpressionContainer") return { node: attr.value.expression, jsxAttr: false };
    return null;
  }
  if (attr.value && attr.value.type === "JSXExpressionContainer" && attr.value.expression.type === "ObjectExpression") {
    const prop = attr.value.expression.properties.find(
      (p) => p.type === "ObjectProperty" && !p.computed &&
        ((p.key.type === "Identifier" && p.key.name === parts[1]) ||
          (p.key.type === "StringLiteral" && p.key.value === parts[1])),
    );
    return prop ? { node: prop.value, jsxAttr: false } : null;
  }
  return null;
}

// A JSX attribute string value cannot use JS escapes; entity-escape instead.
const jsxAttrString = (s) =>
  '"' + String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '"';

/**
 * Replace an attribute value. By default only static literals are editable;
 * with opts.force, a dynamic expression (variable/animation/conditional) is
 * REPLACED by a fixed literal (opts.kind decides number vs string/color).
 * Returns {applied, prev, next}.
 */
export function writeAttribute(file, line, col, attrPath, value, tag, opts = {}) {
  const code = fs.readFileSync(file, "utf8");
  const ast = parseFile(code, file);
  const elPath = findOpening(ast, line, col, tag);
  if (!elPath) return { applied: false, reason: "element not found" };
  const loc = locateValueNode(elPath.node, attrPath);
  if (!loc) return { applied: false, reason: "attribute not found" };
  const node = loc.node;
  const asNumber = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : null;
  };
  const asString = (v) => (loc.jsxAttr ? jsxAttrString(v) : JSON.stringify(String(v)));
  let serialized;
  if (node.type === "NumericLiteral" || isNegNumber(node)) {
    serialized = asNumber(value);
    if (serialized == null) return { applied: false, reason: "not a number" };
  } else if (node.type === "StringLiteral") {
    serialized = asString(value);
  } else if (opts.force) {
    // overwrite the dynamic expression with a literal of the requested kind
    if (opts.kind === "number") {
      serialized = asNumber(value);
      if (serialized == null) return { applied: false, reason: "not a number" };
    } else {
      serialized = asString(value);
    }
  } else {
    return { applied: false, reason: "not an editable literal" };
  }
  const next = code.slice(0, node.start) + serialized + code.slice(node.end);
  fs.writeFileSync(file, next);
  return { applied: true, prev: code, next };
}

const escapeJsx = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/{/g, "&#123;").replace(/}/g, "&#125;");

/** Replace the single text child of the element at line:col. Returns {applied, prev, next}. */
export function editText(file, line, col, newText, tag) {
  const code = fs.readFileSync(file, "utf8");
  const ast = parseFile(code, file);
  const elPath = findOpening(ast, line, col, tag);
  if (!elPath) return { applied: false, reason: "element not found" };
  const jsxEl = elPath.parentPath && elPath.parentPath.node;
  if (!jsxEl || jsxEl.type !== "JSXElement") return { applied: false, reason: "not an element" };
  const textKids = jsxEl.children.filter((c) => c.type === "JSXText" && c.value.trim() !== "");
  if (textKids.length !== 1) return { applied: false, reason: "not plain text" };
  const tnode = textKids[0];
  const lead = tnode.value.match(/^\s*/)[0];
  const trail = tnode.value.match(/\s*$/)[0];
  const replaced = lead + escapeJsx(newText) + trail;
  const next = code.slice(0, tnode.start) + replaced + code.slice(tnode.end);
  fs.writeFileSync(file, next);
  return { applied: true, prev: code, next };
}

/** Remove the whole element at line:col, but only when it's a removable JSX child. */
export function removeElementByLoc(file, line, col, tag) {
  const code = fs.readFileSync(file, "utf8");
  const ast = parseFile(code, file);
  const elPath = findOpening(ast, line, col, tag);
  if (!elPath) return { applied: false, reason: "element not found" };
  const jsxEl = elPath.parentPath && elPath.parentPath.node;
  if (!jsxEl || (jsxEl.type !== "JSXElement" && jsxEl.type !== "JSXFragment")) {
    return { applied: false, reason: "not an element" };
  }
  // Only safe to delete when the element is one of several JSX children, i.e. its
  // grandparent is a JSXElement/JSXFragment. If it's a return value, &&, ?:, map
  // callback, array item, etc., removing it would leave broken syntax.
  const gp = elPath.parentPath.parentPath && elPath.parentPath.parentPath.node;
  if (!gp || (gp.type !== "JSXElement" && gp.type !== "JSXFragment")) {
    return { applied: false, reason: "cannot delete (it is the only expression in its context)" };
  }
  let end = jsxEl.end;
  const after = code.slice(end);
  const ws = after.match(/^[ \t]*\n?/);
  if (ws) end += ws[0].length;
  const next = code.slice(0, jsxEl.start) + code.slice(end);
  fs.writeFileSync(file, next);
  return { applied: true, prev: code, next };
}
