// Copies the Pyodide runtime (Python in WebAssembly) into public/pyodide so the
// site can run teams' Pybricks code in the browser without any CDN.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const src = dirname(require.resolve("pyodide/package.json"));
const dest = join(process.cwd(), "public", "pyodide");
const files = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
];
mkdirSync(dest, { recursive: true });
for (const f of files) {
  const to = join(dest, f);
  if (!existsSync(to)) cpSync(join(src, f), to);
}
console.log("pyodide runtime ready in public/pyodide");
