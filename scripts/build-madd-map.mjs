import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = Number(process.env.TAJWEED_MAP_BATCH_SIZE || 500);
const SOURCE_VERSION = "burhan-tajweed-madd-v1";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u;
const SHADDAH = "ّ";
const SUKUN = "ْ";
const FATHA = "َ";
const DAMMA = "ُ";
const KASRA = "ِ";
const FATHATAN = "ً";
const HAMZA_BASES = new Set(["ء", "أ", "إ", "ؤ", "ئ", "آ"]);

function isMark(character) {
  return MARKS.test(character);
}

function parseUnits(word) {
  const chars = [...word];
  const units = [];

  for (let index = 0; index < chars.length; index++) {
    const character = chars[index];

    if (isMark(character) || character === "ـ") {
      if (units.length) {
        units[units.length - 1].marks.push(character);
        units[units.length - 1].end = index + 1;
      }
      continue;
    }

    units.push({
      base: character,
      marks: [],
      start: index,
      end: index + 1,
    });
  }

  return units;
}

function hasMark(unit, mark) {
  return Boolean(unit?.marks.includes(mark));
}

function isMaddLetter(unit, previous) {
  if (!unit) return false;
  if (unit.base === "آ") return true;
  if (unit.marks.includes("ٰ")) return true;
  if (unit.base === "ا" && hasMark(previous, FATHA)) return true;
  if (unit.base === "ى" && hasMark(previous, FATHA)) return true;
  if (unit.base === "و" && hasMark(previous, DAMMA)) return true;
  if (unit.base === "ي" && hasMark(previous, KASRA)) return true;
  return false;
}

function isHamza(unit) {
  return Boolean(unit && HAMZA_BASES.has(unit.base));
}

function add(
  out,
  word,
  nextWord,
  wordIndex,
  unit,
  nextUnit,
  ruleCode,
  expectedBehavior,
  wordCharOffset = 0,
  nextWordCharOffset = wordCharOffset,
) {
  const contextText = nextWord ? word + " " + nextWord : word;
  const triggerText = nextWord && nextUnit
    ? word.slice(unit.start) + " " + nextWord.slice(0, nextUnit.end)
    : word.slice(unit.start, unit.end);

  out.push({
    ayah_id: null,
    word_index: wordIndex,
    word_index_end: nextWord && nextUnit ? wordIndex + 1 : wordIndex,
    char_start: wordCharOffset + unit.start,
    char_end: nextUnit ? nextWordCharOffset + nextUnit.end : wordCharOffset + unit.end,
    trigger_text: triggerText,
    context_text: contextText,
    expected_behavior: expectedBehavior,
    source_version: SOURCE_VERSION,
    _rule_code: ruleCode,
  });
}

function detectMadd(
  word,
  wordIndex,
  nextWord = "",
  wordCharOffset = 0,
  nextWordCharOffset = 0,
) {
  const units = parseUnits(word);
  const nextUnits = parseUnits(nextWord);
  const out = [];

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const previous = units[i - 1];
    const following = units[i + 1];

    if (unit.base === "آ") {
      add(out, word, nextWord, wordIndex, unit, undefined, "madd_badl", {
        cause: "preceding_hamza_embedded_in_alif_maddah",
        reference_duration: "route_profile",
      }, wordCharOffset, nextWordCharOffset);
      continue;
    }

    if (!isMaddLetter(unit, previous)) continue;

    if (previous && HAMZA_BASES.has(previous.base)) {
      add(out, word, nextWord, wordIndex, unit, undefined, "madd_badl", {
        cause: "preceding_hamza",
        reference_duration: "route_profile",
      }, wordCharOffset, nextWordCharOffset);
      continue;
    }

    if (following && isHamza(following)) {
      add(out, word, nextWord, wordIndex, unit, following, "madd_muttasil", {
        cause: "hamza_same_word",
        reference_duration: "route_profile",
      }, wordCharOffset, nextWordCharOffset);
      continue;
    }

    if (!following && nextUnits.length && isHamza(nextUnits[0])) {
      add(out, word, nextWord, wordIndex, unit, nextUnits[0], "madd_munfasil", {
        cause: "hamza_next_word",
        reference_duration: "route_profile",
      }, wordCharOffset, nextWordCharOffset);
      continue;
    }

    if (following && hasMark(following, SHADDAH)) {
      add(out, word, nextWord, wordIndex, unit, following, "madd_lazim_kalimi_muthaqqal", {
        cause: "original_sukun_with_shaddah",
        reference_duration: "6_harakah",
        requires_acoustic_validation: true,
      }, wordCharOffset, nextWordCharOffset);
      continue;
    }

    if (following && hasMark(following, SUKUN)) {
      add(out, word, nextWord, wordIndex, unit, following, "madd_lazim_kalimi_mukhaffaf", {
        cause: "original_sukun",
        reference_duration: "6_harakah",
        requires_acoustic_validation: true,
      }, wordCharOffset, nextWordCharOffset);
      continue;
    }

    if (!nextWord && i === units.length - 2) {
      const finalUnit = units.at(-1);
      if (
        finalUnit &&
        finalUnit.marks.some((mark) => mark === FATHA || mark === DAMMA || mark === KASRA)
      ) {
        add(out, word, nextWord, wordIndex, unit, finalUnit, "madd_arid_lissukun", {
          condition: "waqf",
          base_rule_at_wasl: "madd_asli",
          allowed_duration: "route_profile",
          requires_acoustic_validation: true,
        }, wordCharOffset, nextWordCharOffset);
        continue;
      }
    }

    add(out, word, nextWord, wordIndex, unit, undefined, "madd_asli", {
      cause: "no_secondary_cause_detected",
      reference_duration: "2_harakah",
      requires_acoustic_validation: true,
    }, wordCharOffset, nextWordCharOffset);
  }

  const finalUnit = units.at(-1);

  if (!nextWord) {
    const iwadSource =
      finalUnit?.marks.includes(FATHATAN)
        ? finalUnit
        : units.at(-2)?.marks.includes(FATHATAN)
          ? units.at(-2)
          : undefined;
    const iwadFinalBase =
      finalUnit?.base === "ا" ? units.at(-2)?.base : finalUnit?.base;

    if (iwadSource && iwadFinalBase !== "ة") {
      out.push({
        ayah_id: null,
        word_index: wordIndex,
        word_index_end: wordIndex,
        char_start: wordCharOffset + iwadSource.start,
        char_end: wordCharOffset + (finalUnit?.end ?? iwadSource.end),
        trigger_text: word.slice(iwadSource.start, finalUnit?.end ?? iwadSource.end),
        context_text: word,
        expected_behavior: {
          condition: "waqf",
          reference_duration: "2_harakah",
          excluded_final_letter: "ta_marbuta",
        },
        source_version: SOURCE_VERSION,
        _rule_code: "madd_iwad",
      });
    }
  }

  if (!nextWord && units.length >= 3 && finalUnit) {
    const penultimate = units.at(-2);
    const beforePenultimate = units.at(-3);

    if (
      finalUnit.marks.some((mark) => mark === FATHA || mark === DAMMA || mark === KASRA || mark === "ٍ" || mark === "ٌ") &&
      penultimate?.base === "و" &&
      hasMark(penultimate, SUKUN) &&
      hasMark(beforePenultimate, FATHA)
    ) {
      out.push({
        ayah_id: null,
        word_index: wordIndex,
        word_index_end: wordIndex,
        char_start: wordCharOffset + penultimate.start,
        char_end: wordCharOffset + penultimate.end,
        trigger_text: word.slice(penultimate.start, penultimate.end),
        context_text: word,
        expected_behavior: {
          condition: "waqf",
          reference_duration: "route_profile",
          requires_acoustic_validation: true,
        },
        source_version: SOURCE_VERSION,
        _rule_code: "madd_leen",
      });
    }

    if (
      finalUnit.marks.some((mark) => mark === FATHA || mark === DAMMA || mark === KASRA || mark === "ٍ" || mark === "ٌ") &&
      penultimate?.base === "ي" &&
      hasMark(penultimate, SUKUN) &&
      hasMark(beforePenultimate, FATHA)
    ) {
      out.push({
        ayah_id: null,
        word_index: wordIndex,
        word_index_end: wordIndex,
        char_start: wordCharOffset + penultimate.start,
        char_end: wordCharOffset + penultimate.end,
        trigger_text: word.slice(penultimate.start, penultimate.end),
        context_text: word,
        expected_behavior: {
          condition: "waqf",
          reference_duration: "route_profile",
          requires_acoustic_validation: true,
        },
        source_version: SOURCE_VERSION,
        _rule_code: "madd_leen",
      });
    }
  }

  return out;
}

async function fetchAllAyahs() {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("ayahs")
      .select("id,text_ar")
      .order("surah_id", { ascending: true })
      .order("ayah_number", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < pageSize) break;
  }

  return rows;
}

async function loadRuleIds() {
  const { data, error } = await supabase.from("tajweed_rules").select("id,code");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.code, row.id]));
}

async function insertBatches(rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map(({ _rule_code, ...row }) => ({
      ...row,
      rule_id: ruleIds.get(_rule_code),
    }));

    const { error } = await supabase
      .from("tajweed_occurrences")
      .upsert(batch, {
        onConflict:
          "ayah_id,rule_id,char_start,char_end,word_index,word_index_end,trigger_text",
      });

    if (error) throw new Error(error.message);

    console.log(
      `madd occurrences: ${Math.min(i + batch.length, rows.length)}/${rows.length}`,
    );
  }
}

const ruleIds = await loadRuleIds();
const ayahs = await fetchAllAyahs();

if (ayahs.length !== 6236) {
  throw new Error(`Expected 6236 ayahs, got ${ayahs.length}`);
}

await supabase
  .from("tajweed_occurrences")
  .delete()
  .eq("source_version", SOURCE_VERSION);

const rows = [];

for (const ayah of ayahs) {
  const wordMatches = [...ayah.text_ar.matchAll(/\S+/gu)];

  for (let wordIndex = 0; wordIndex < wordMatches.length; wordIndex++) {
    const match = wordMatches[wordIndex];
    const nextMatch = wordMatches[wordIndex + 1];
    const word = match[0];
    const nextWord = nextMatch?.[0] ?? "";
    const wordCharOffset = match.index ?? 0;
    const nextWordCharOffset = nextMatch?.index ?? wordCharOffset;
    const nextWordCharOffset =
      nextWord ? wordCharOffset + word.length + 1 : wordCharOffset;

    const detected = detectMadd(
      word,
      wordIndex,
      nextWord,
      wordCharOffset,
      nextWordCharOffset,
    );

    for (const occurrence of detected) {
      occurrence.ayah_id = ayah.id;
      rows.push(occurrence);
    }
  }
}

await insertBatches(rows);

const { count, error } = await supabase
  .from("tajweed_occurrences")
  .select("id", { count: "exact", head: true })
  .eq("source_version", SOURCE_VERSION);

if (error) throw new Error(error.message);

console.log(JSON.stringify({
  ok: true,
  ayahs: ayahs.length,
  madd_occurrences: count,
  source_version: SOURCE_VERSION,
}, null, 2));
