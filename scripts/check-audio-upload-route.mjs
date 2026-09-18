import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../app/api/v1/audio/upload/route.ts", import.meta.url),
  "utf8",
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const state = {
  uploads: [],
  signedPath: null,
};

class MockQuery {
  constructor(table) { this.table = table; }
  select() { return this; }
  eq() { return this; }
  maybeSingle() {
    if (this.table === "test_attempts") {
      return Promise.resolve({
        data: {
          id: "00000000-0000-4000-8000-000000000001",
          test_id: "00000000-0000-4000-8000-000000000010",
          submitted_at: null,
        },
        error: null,
      });
    }
    if (this.table === "test_questions") {
      return Promise.resolve({
        data: {
          id: "00000000-0000-4000-8000-000000000002",
          test_id: "00000000-0000-4000-8000-000000000010",
          question_type: "recite_range",
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }
}

const storage = {
  from(bucket) {
    assert.equal(bucket, "burhan-audio");
    return {
      async upload(filePath, file, options) {
        state.uploads.push({ filePath, file, options });
        return { data: { path: filePath }, error: null };
      },
      async createSignedUrl(filePath, expires) {
        assert.equal(expires, 3600);
        state.signedPath = filePath;
        return { data: { signedUrl: "https://yqqwkfpqxtvjqafmtepx.supabase.co/storage/v1/object/sign/burhan-audio/" + encodeURIComponent(filePath) + "?token=test" }, error: null };
      },
      async remove(paths) {
        state.removed = paths;
        return { data: null, error: null };
      },
    };
  },
};

const stubs = {
  next: '({NextResponse:{json(data,init){return {status:init?.status??200,async json(){return data;}};}}})',
  zod: '({z:{string(){const c={uuid(){return c;}};c.safeParse=(v)=>({success:typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)});return c;}}})',
  supabase: '({getSupabaseAdmin(){return {from(table){return new globalThis.__BurhanAudioMockQuery(table);},storage:globalThis.__BurhanAudioStorage};}})',
};

globalThis.__BurhanAudioMockQuery = MockQuery;
globalThis.__BurhanAudioStorage = storage;

let moduleSource = transpiled
  .replace('require("next/server")', stubs.next)
  .replace('require("zod")', stubs.zod)
  .replace('require("../../../../lib/supabase-admin")', stubs.supabase);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "burhan-audio-upload-"));
const modulePath = path.join(tempDir, "route.cjs");
fs.writeFileSync(modulePath, moduleSource);

const { POST } = await import(modulePath);

const form = new FormData();
form.set("attempt_id", "00000000-0000-4000-8000-000000000001");
form.set("question_id", "00000000-0000-4000-8000-000000000002");
form.set("file", new File([Buffer.from("audio")], "recitation.wav", { type: "audio/wav" }));

const response = await POST(new Request("https://burhan.test/api/v1/audio/upload", {
  method: "POST",
  body: form,
}));
const payload = await response.json();

assert.equal(response.status, 200);
assert.equal(payload.bucket, "burhan-audio");
assert.equal(payload.file.mime_type, "audio/wav");
assert.equal(payload.file.extension, "wav");
assert.equal(payload.expires_in_seconds, 3600);
assert.ok(payload.audio_url.startsWith("https://"));
assert.equal(state.uploads.length, 1);
assert.equal(state.uploads[0].options.contentType, "audio/wav");
assert.equal(state.uploads[0].options.upsert, false);
assert.ok(state.signedPath.endsWith(".wav"));

const invalid = new FormData();
invalid.set("attempt_id", "bad");
invalid.set("question_id", "00000000-0000-4000-8000-000000000002");
invalid.set("file", new File([Buffer.from("audio")], "x.wav", { type: "audio/wav" }));
const invalidResponse = await POST(new Request("https://burhan.test/api/v1/audio/upload", {
  method: "POST",
  body: invalid,
}));
assert.equal(invalidResponse.status, 400);
assert.equal((await invalidResponse.json()).error, "INVALID_REQUEST_IDS");

console.log("audio upload route acceptance checks passed");
