import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../app/api/v1/tajweed-analysis/run/route.ts", import.meta.url),
  "utf8",
);
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const attemptId = "00000000-0000-4000-8000-000000000001";
const questionId = "00000000-0000-4000-8000-000000000002";
const ayahId = "00000000-0000-4000-8000-000000000011";
const occurrenceId = "00000000-0000-4000-8000-000000000021";
const audioAnswerId = "00000000-0000-4000-8000-000000000031";
const analysisId = "00000000-0000-4000-8000-000000000041";
const stateKey = "__burhanRouteAcceptanceState";

let providerInput = null;
let storedAudio = null;
let storedAnalysis = null;
let storedMeasurements = null;
let attemptState = "open";

const rows = {
  test_attempts: { id: attemptId, test_id: "test-1", submitted_at: null },
  test_questions: {
    id: questionId,
    test_id: "test-1",
    question_type: "recitation",
    expected_answer: [{ surah_id: 1, ayah_number: 1 }],
  },
  ayahs: [{ id: ayahId, surah_id: 1, ayah_number: 1 }],
  quran_phoneme_references: [{
    ayah_id: ayahId,
    phoneme_version: "quran-phoneme-v1",
    phonemes: ["a", "a:", "t"],
    letter_phoneme_mappings: [
      { chars: "ا", char_start: 7, char_end: 8, phonemes: ["a"], phoneme_start: 0, phoneme_end: 1 },
      { chars: "ٰ", char_start: 8, char_end: 8, phonemes: ["a:"], phoneme_start: 1, phoneme_end: 2 },
    ],
    tajweed_mappings: [],
  }],
  tajweed_occurrences: [{
    id: occurrenceId,
    ayah_id: ayahId,
    rule_id: "madd-rule",
    word_index: 1,
    word_index_end: 1,
    char_start: 7,
    char_end: 11,
    trigger_text: "مٰ",
    context_text: "مٰ",
    expected_behavior: {},
    rule: { code: "madd_asli", name_ar: "مد أصلي", name_en: "Madd Asli", category: "madd" },
  }],
  tajweed_madd_profiles: [{
    profile_code: "hafs_asim_baseline_v1",
    profile_name_ar: "حفص baseline",
    qiraah: "Asim",
    riwayah: "Hafs",
    tariq: null,
    rule_code: "madd_asli",
    allowed_harakah: [2],
    measurement_mode: "fixed_harakah",
    notes: "acceptance",
  }],
};

class MockQuery {
  constructor(table) { this.table = table; }
  select() { return this; }
  eq() { return this; }
  in() { return this; }
  order() { return this; }
  upsert(payload) {
    if (this.table === "burhan_audio_answers") storedAudio = payload;
    if (this.table === "burhan_tajweed_analyses") storedAnalysis = payload;
    if (this.table === "burhan_madd_measurements") storedMeasurements = payload;
    return this;
  }
  maybeSingle() {
    if (this.table === "test_attempts") {
      return Promise.resolve({
        data: attemptState === "missing" ? null : {
          ...rows.test_attempts,
          submitted_at: attemptState === "submitted" ? "2026-09-18T00:00:00.000Z" : null,
        },
        error: null,
      });
    }
    if (this.table === "test_questions") {
      return Promise.resolve({ data: rows.test_questions, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }
  single() {
    if (this.table === "burhan_audio_answers") {
      return Promise.resolve({ data: { id: audioAnswerId }, error: null });
    }
    if (this.table === "burhan_tajweed_analyses") {
      return Promise.resolve({
        data: {
          id: analysisId,
          attempt_id: attemptId,
          question_id: questionId,
          audio_answer_id: audioAnswerId,
          analysis_version: "tajweed-v1-phoneme",
          model: "acceptance-provider:acceptance-v1",
          pronunciation_score: 100,
          tajweed_score: 94,
          confidence: 0.96,
          audio_quality: "good",
          issue_detected: false,
          unresolved_items: 0,
          verdict_status: "verified",
          review_reasons: [],
          summary: {},
          evidence: [],
          created_at: "2026-09-18T00:00:00.000Z",
          updated_at: "2026-09-18T00:00:00.000Z",
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  }
  then(resolve, reject) {
    let data = [];
    if (this.table === "ayahs") data = rows.ayahs;
    if (this.table === "quran_phoneme_references") data = rows.quran_phoneme_references;
    if (this.table === "tajweed_occurrences") data = rows.tajweed_occurrences;
    if (this.table === "tajweed_madd_profiles") data = rows.tajweed_madd_profiles;
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}

globalThis[stateKey] = { providerInput: null };
globalThis.__burhanMockQuery = MockQuery;

const stubs = {
  next: '({NextResponse:{json(data,init){return {status:init?.status??200,async json(){return data;}};}}})',
  zod: '({z:{string(){const c={uuid(){return c;},url(){return c;},trim(){return c;},min(){return c;},max(){return c;},default(){return c;}};return c;},object(){return {safeParse(input){if(!input||typeof input!=="object")return {success:false,error:{flatten(){return {fieldErrors:{_form:["Invalid request"]}};}}};const uuid=(v)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);const errors={};if(!uuid(input.attempt_id))errors.attempt_id=["Invalid uuid"];if(!uuid(input.question_id))errors.question_id=["Invalid uuid"];try{new URL(input.audio_url);}catch{errors.audio_url=["Invalid url"];}if(Object.keys(errors).length)return {success:false,error:{flatten(){return {fieldErrors:errors};}}};return {success:true,data:{...input,profile_code:typeof input.profile_code==="string"&&input.profile_code.trim()?input.profile_code.trim():"hafs_asim_baseline_v1"}};}};}}})',
  supabase: '({getSupabaseAdmin(){return {from(table){return new globalThis.__burhanMockQuery(table);}};}})',
  compare: '({comparePhonemes(reference,predicted){if(JSON.stringify(reference)!==JSON.stringify(predicted))throw new Error("phoneme mismatch");return {score:100,distance:0,matched_count:reference.length,substitutions:0,deletions:0,insertions:0,operations:[]};}})',
  scheme: '({canonicalizePhonemeSequence(values){return values.slice();},countUnknownPhonemes(){return 0;}})',
  maddEval: '({evaluateMaddObservations(){return [{occurrence_id:"00000000-0000-4000-8000-000000000021",rule_code:"madd_asli",observed_duration_ms:180,reference_harakah_ms:90,estimated_harakah:2,expected_harakah:[2],deviation_percent:0,measurement_confidence:0.95,stop_detected:null,status:"verified",reasons:[],evidence:{}}];},summarizeMaddMeasurements(){return {total:1,verified:1,detected_issues:0,needs_teacher_review:0,not_assessed:0};}})',
  review: '({decideTeacherReview(){return {verdictStatus:"verified",requiresTeacherReview:false,reasons:[]};}})',
  provider: '({async runPhonemeProvider(input){globalThis["__burhanRouteAcceptanceState"].providerInput=input;return {provider:"acceptance-provider",model:"acceptance-v1",predicted_phonemes:["a","a:","t"],phoneme_timings:[{index:0,phoneme:"a",start_ms:0,end_ms:100,confidence:0.99},{index:1,phoneme:"a:",start_ms:100,end_ms:280,confidence:0.98},{index:2,phoneme:"t",start_ms:280,end_ms:360,confidence:0.97}],confidence:0.96,audio_quality:"good",tajweed_score:94,issue_detected:false,evidence:[],summary:{provider_summary:"ok"},madd_observations:[{occurrence_id:"00000000-0000-4000-8000-000000000021",duration_ms:180,confidence:0.95,start_ms:100,end_ms:280}]};}})',
  maddProvider: '({async runMaddAcousticProvider(){throw new Error("dedicated Madd provider should not be called");}})',
  map: '({mapMaddCharRangeToPhonemeSpan(){return {start:1,end:2};}})',
  alignment: '({buildMaddTimingObservations(){return {observations:[{occurrence_id:"00000000-0000-4000-8000-000000000021",duration_ms:180,reference_harakah_ms:90,confidence:0.95,start_ms:100,end_ms:280,evidence:{}}],alignments:[{occurrence_id:"00000000-0000-4000-8000-000000000021",status:"aligned",start_ms:100,end_ms:280,duration_ms:180,confidence:0.95}]};}})',
  evidence: '({buildPhonemeErrorEvidence(){return [];},buildPhonemeReferenceSegments(){return [];},summarizePhonemeErrorsByAyah(){return [];}})',
};

let moduleSource = transpiled;
for (const [from,to] of [
  ['require("next/server")', stubs.next],
  ['require("zod")', stubs.zod],
  ['require("../../../../../lib/supabase-admin")', stubs.supabase],
  ['require("../../../../../lib/burhan/phoneme-evaluator")', stubs.compare],
  ['require("../../../../../lib/burhan/phoneme-scheme")', stubs.scheme],
  ['require("../../../../../lib/burhan/madd-acoustic-evaluator")', stubs.maddEval],
  ['require("../../../../../lib/burhan/teacher-review")', stubs.review],
  ['require("../../../../../lib/burhan/phoneme-provider")', stubs.provider],
  ['require("../../../../../lib/burhan/madd-acoustic-provider")', stubs.maddProvider],
  ['require("../../../../../lib/burhan/phoneme-reference-map")', stubs.map],
  ['require("../../../../../lib/burhan/madd-phoneme-alignment")', stubs.alignment],
  ['require("../../../../../lib/burhan/phoneme-evidence")', stubs.evidence],
]) moduleSource = moduleSource.replaceAll(from,to);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "burhan-route-"));
const modulePath = path.join(tempDir, "route.cjs");
fs.writeFileSync(modulePath, moduleSource);
process.env.BURHAN_MADD_REFERENCE_HARAKAH_MS = "90";
delete process.env.BURHAN_MADD_ACOUSTIC_PROVIDER_URL;

const { POST } = await import(modulePath);

const makeRequest = (body) => new Request(
  "https://burhan.test/api/v1/tajweed-analysis/run",
  { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify(body) },
);

let response = await POST(makeRequest({
  attempt_id: attemptId,
  question_id: questionId,
  audio_url: "https://audio.example/recording.wav",
}));
let payload = await response.json();

assert.equal(response.status, 200);
assert.equal(payload.provider.name, "acceptance-provider");
assert.equal(payload.analysis.id, analysisId);
assert.equal(payload.analysis.verdict_status, "verified");
assert.equal(payload.madd.summary.verified, 1);
assert.equal(payload.review.required, false);

assert.ok(globalThis[stateKey].providerInput);
assert.deepEqual(globalThis[stateKey].providerInput.referencePhonemes, ["a","a:","t"]);
assert.equal(globalThis[stateKey].providerInput.maddTargets.length, 1);
assert.equal(globalThis[stateKey].providerInput.maddTargets[0].occurrence_id, occurrenceId);
assert.deepEqual(
  {phoneme_start:globalThis[stateKey].providerInput.maddTargets[0].phoneme_start,phoneme_end:globalThis[stateKey].providerInput.maddTargets[0].phoneme_end},
  {phoneme_start:1,phoneme_end:2},
);

assert.ok(storedAudio);
assert.equal(storedAudio.attempt_id, attemptId);
assert.equal(storedAudio.question_id, questionId);
assert.equal(storedAudio.audio_url, "https://audio.example/recording.wav");

assert.ok(storedAnalysis);
assert.equal(storedAnalysis.audio_answer_id, audioAnswerId);
assert.equal(storedAnalysis.analysis_version, "tajweed-v1-phoneme");
assert.equal(storedAnalysis.pronunciation_score, 100);
assert.equal(storedAnalysis.tajweed_score, 94);
assert.equal(storedAnalysis.verdict_status, "verified");

assert.ok(Array.isArray(storedMeasurements));
assert.equal(storedMeasurements.length, 1);
assert.equal(storedMeasurements[0].analysis_id, analysisId);
assert.equal(storedMeasurements[0].occurrence_id, occurrenceId);

response = await POST(makeRequest({
  attempt_id: "bad",
  question_id: questionId,
  audio_url: "https://audio.example/recording.wav",
}));
assert.equal(response.status, 400);
assert.equal((await response.json()).error, "INVALID_REQUEST");

attemptState = "submitted";
response = await POST(makeRequest({
  attempt_id: attemptId,
  question_id: questionId,
  audio_url: "https://audio.example/recording.wav",
}));
assert.equal(response.status, 409);
assert.equal((await response.json()).error, "ATTEMPT_ALREADY_SUBMITTED");

console.log("tajweed analysis route acceptance checks passed");
