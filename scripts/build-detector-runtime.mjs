import { build } from "esbuild";
import { mkdir, copyFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Emit a self-contained worker outside Next's server graph. OpenCV and ONNX must
// never inflate the initial React bundle or run inference on the UI thread.
const require = createRequire(import.meta.url);
const output = "public/detector-runtime";
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: ["lib/detector/vision.worker.ts"],
  outdir: output, entryNames: "vision-worker", chunkNames: "chunk-[hash]",
  bundle: true, splitting: true, format: "esm", platform: "browser", target: "es2022",
  minify: true, external: ["fs", "path", "crypto", "node:*"], logLevel: "warning",
});
const ortDist = dirname(require.resolve("onnxruntime-web"));
for (const name of await readdir(ortDist)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(name) && !/asyncify|jspi/.test(name)) {
    await copyFile(join(ortDist, name), join(output, name));
  }
}
const handWasm = join(dirname(require.resolve("@mediapipe/tasks-vision")), "wasm");
await mkdir(join(output, "hands"), { recursive: true });
for (const name of await readdir(handWasm)) {
  if (/^vision_wasm_module_internal\.(wasm|js)$/.test(name)) await copyFile(join(handWasm, name), join(output, "hands", name));
}
console.log("Detector worker and matching ONNX runtime assets prepared.");
