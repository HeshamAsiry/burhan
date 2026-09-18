import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../lib/burhan/provider-fetch.ts", import.meta.url),
  "utf8",
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "burhan-provider-fetch-"));
const modulePath = path.join(tempDir, "provider-fetch.cjs");
fs.writeFileSync(modulePath, transpiled);

const mod = await import(modulePath);
process.env.BURHAN_TEST_PROVIDER_TIMEOUT = "1";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (_input, init) =>
  new Promise((_, reject) => {
    const signal = init?.signal;
    signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  });

let timedOut = false;
try {
  await mod.fetchWithProviderTimeout(
    "https://example.com",
    { method: "POST" },
    "BURHAN_TEST_PROVIDER_TIMEOUT",
  );
} catch (error) {
  timedOut =
    error instanceof Error &&
    error.message === "Provider request timed out after 1ms.";
}

globalThis.fetch = originalFetch;

if (!timedOut) {
  throw new Error("provider timeout acceptance check failed");
}

console.log("provider timeout acceptance checks passed");
