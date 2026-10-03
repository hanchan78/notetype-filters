import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { Script } from "node:vm";
const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
  minify: true,
  metafile: true,
  banner: { js: "/* NoteType Filters — generated from src/main.ts */" },
});
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
for (const field of [
  "id",
  "name",
  "version",
  "minAppVersion",
  "description",
  "author",
])
  assert.equal(typeof manifest[field], "string", `Manifest requires ${field}`);
assert.equal(manifest.id, "notetype-filters");
assert.equal(manifest.isDesktopOnly, false);
assert.ok((await readFile("styles.css", "utf8")).trim().length > 0);
for (const output of Object.values(result.metafile.outputs))
  for (const dependency of output.imports)
    assert.equal(
      dependency.path,
      "obsidian",
      "Only the Obsidian host may be external",
    );
const module = { exports: {} };
new Script(await readFile("main.js", "utf8")).runInNewContext({
  module,
  exports: module.exports,
  require: (id) => {
    assert.equal(id, "obsidian");
    return { Plugin: class {}, ItemView: class {}, Modal: class {}, PluginSettingTab: class {}, SuggestModal: class {} };
  },
});
assert.equal(
  typeof module.exports.default,
  "function",
  "Plugin default export must be a class",
);
console.log(
  "Validated manifest, stylesheet, CommonJS plugin export, and Obsidian-only external dependency.",
);
