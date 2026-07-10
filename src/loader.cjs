// Webpack pre-loader: stamps every host JSX element with
// data-loc="relative/file.tsx:line:col" so the overlay can map a clicked DOM
// node back to its exact source line. The project root is passed as an option
// (falls back to process.cwd()).
const babel = require("@babel/core");
const path = require("path");

module.exports = function dataLocLoader(source) {
  const root = (this.getOptions && this.getOptions().root) || process.cwd();
  const filename = this.resourcePath;
  if (!/\.[jt]sx$/.test(filename) || filename.includes("node_modules")) return source;

  const out = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: false,
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [
      function dataLocBabel({ types: t }) {
        return {
          name: "data-loc",
          visitor: {
            JSXOpeningElement(p, state) {
              const name = p.node.name;
              if (name.type !== "JSXIdentifier") return; // skip members/namespaced
              if (!/^[a-z]/.test(name.name)) return; // only host elements
              const has = p.node.attributes.some(
                (a) => a.type === "JSXAttribute" && a.name && a.name.name === "data-loc",
              );
              if (has) return;
              const loc = p.node.loc;
              const fn = state.file.opts.filename;
              if (!loc || !fn) return;
              const rel = path.relative(root, fn);
              const value = `${rel}:${loc.start.line}:${loc.start.column}`;
              p.node.attributes.push(
                t.jsxAttribute(t.jsxIdentifier("data-loc"), t.stringLiteral(value)),
              );
            },
          },
        };
      },
    ],
  });

  return out && out.code ? out.code : source;
};
