import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../lib/burhan/phoneme-provider.ts", import.meta.url),
  "utf8",
);

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "burhan-phoneme-provider-"));
const modulePath = path.join(tempDir, "phoneme-provider.cjs");
fs.writeFileSync(modulePath, transpiled);

// This acceptance harness isolates the provider adapter from Supabase/Next.js.
// Relative imports are stubbed so we can exercise the actual response contract,
// filtering, and timeout integration without contacting an external provider.
const moduleSource = transpiled
  .replace(
    'require("./audio-url")',
    '({ validateAudioUrl(value) { if (!String(value).startsWith("https://")) throw new Error("invalid audio"); } })',
  )
  .replace(
    'require("./huggingface-phoneme-provider")',
    '({ runHuggingFacePhonemeProvider() { throw new Error("unexpected huggingface provider"); } })',
  )
  .replace(
    'require("./provider-fetch")',
    '({ async fetchWithProviderTimeout(input, init) { return globalThis.fetch(input, init); } })',
  )
  .replace(
    'require("./phoneme-provider-contract")',
    '({ parsePhonemeTimings(value, predicted) { if (!Array.isArray(value)) throw new Error("missing timings"); return value; } })',
  );

fs.writeFileSync(modulePath, moduleSource);
const mod = await import(modulePath);

process.env.BURHAN_TAJWEED_PHONEME_PROVIDER = "custom";
process.env.BURHAN_TAJWEED_PHONEME_PROVIDER_URL = "https://provider.example/analyze";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body));
  if (body.reference_phonemes.length !== 3) {
    throw new Error("provider request did not include reference phonemes");
  }

  return new Response(
    JSON.stringify({
      provider: "acceptance-provider",
      model: "acceptance-v1",
      predicted_phonemes: ["a", "a:", "t"],
      phoneme_timings: [
        { index: 0, phoneme: "a", start_ms: 0, end_ms: 100, confidence: 0.99 },
        { index: 1, phoneme: "a:", start_ms: 100, end_ms: 280, confidence: 0.98 },
        { index: 2, phoneme: "t", start_ms: 280, end_ms: 360, confidence: 0.97 },
      ],
      confidence: 0.96,
      audio_quality: "good",
      tajweed_score: 94,
      issue_detected: false,
      madd_observations: [
        {
          occurrence_id: "madd-1",
          duration_ms: 180,
          confidence: 0.95,
          start_ms: 100,
          end_ms: 280,
        },
        {
          occurrence_id: "unknown-madd",
          duration_ms: 500,
          confidence: 1,
          start_ms: 10,
          end_ms: 510,
        },
        {
          occurrence_id: "madd-1",
          duration_ms: -10,
          confidence: 1,
        },
        {
          occurrence_id: "madd-1",
          duration_ms: 220,
          confidence: 1.5,
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const result = await mod.runPhonemeProvider({
  audioUrl: "https://audio.example/recording.wav",
  referencePhonemes: ["a", "a:", "t"],
  questionId: "acceptance-question",
  maddTargets: [
    {
      occurrence_id: "madd-1",
      rule_code: "madd_asli",
      expected_harakah: [2],
      measurement_mode: "route_profile",
    },
  ],
});

globalThis.fetch = originalFetch;

if (result.provider !== "acceptance-provider") {
  throw new Error("provider name contract failed");
}
if (result.model !== "acceptance-v1") {
  throw new Error("provider model contract failed");
}
if (result.confidence !== 0.96) {
  throw new Error("provider confidence contract failed");
}
if (result.tajweed_score !== 94) {
  throw new Error("provider tajweed score contract failed");
}
if (result.phoneme_timings.length !== 3) {
  throw new Error("phoneme timing contract failed");
}
if (result.madd_observations?.length !== 1) {
  throw new Error("Madd observation filtering contract failed");
}
if (result.madd_observations[0].occurrence_id !== "madd-1") {
  throw new Error("Madd occurrence identity contract failed");
}

console.log("phoneme provider acceptance checks passed");
