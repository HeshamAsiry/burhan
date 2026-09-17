import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = Number(process.env.TAJWEED_MAP_BATCH_SIZE || 500);
const SOURCE_VERSION = "burhan-tajweed-map-v1";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u;
const TANWEEN = new Set(["ً", "ٍ", "ٌ"]);
const SUN_LETTERS = new Set(["ت", "ث", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ل", "ن"]);
const MOON_LETTERS = new Set(["ا", "ب", "ج", "ح", "خ", "ع", "غ", "ف", "ق", "ك", "م", "ه", "و", "ي"]);
const IKHFA_LETTERS = new Set(["ت", "ث", "ج", "د", "ذ", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ف", "ق", "ك"]);
const IZHAR_LETTERS = new Set(["ء", "ه", "ع", "ح", "غ", "خ"]);
const IDGHAM_WITH_GHUNNAH_LETTERS = new Set(["ي", "ن", "م", "و"]);
const IDGHAM_WITHOUT_GHUNNAH_LETTERS = new Set(["ل", "ر"]);
const QALQALAH_LETTERS = new Set(["ق", "ط", "ب", "ج", "د"]);

function stripMarks(value) {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "")
    .replace(/ٱ/g, "ا")
    .trim();
}

function baseLetters(value) {
  return [...value].filter((character) => !ARABIC_MARKS.test(character) && character !== "ـ");
}

function firstBaseLetter(value) {
  return baseLetters(value)[0] ?? null;
}

function lastBaseLetter(value) {
  const letters = baseLetters(value);
  return letters.at(-1) ?? null;
}

function hasSukunAfter(value, letter) {
  return [...value].some((character, index, chars) => {
    if (character !== letter) return false;
    for (let i = index + 1; i < chars.length; i++) {
      if (ARABIC_MARKS.test(chars[i])) return chars[i] === "ْ";
      return false;
    }
    return false;
  });
}

function firstLetterAfterNoonSukun(value) {
  const chars = [...value];

  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== "ن") continue;

    let hasSukun = false;
    let nextIndex = i + 1;

    for (; nextIndex < chars.length && ARABIC_MARKS.test(chars[nextIndex]); nextIndex++) {
      if (chars[nextIndex] === "ْ") hasSukun = true;
    }

    if (hasSukun) {
      for (let j = i + 1; j < chars.length; j++) {
        if (!ARABIC_MARKS.test(chars[j]) && chars[j] !== "ـ") return chars[j];
      }
    }
  }

  return null;
}

function classifyNoon(following) {
  if (IZHAR_LETTERS.has(following)) return "noon_izhar";
  if (IDGHAM_WITH_GHUNNAH_LETTERS.has(following)) return "noon_idgham_ghunnah";
  if (IDGHAM_WITHOUT_GHUNNAH_LETTERS.has(following)) return "noon_idgham_without_ghunnah";
  if (following === "ب") return "noon_iqlab";
  if (IKHFA_LETTERS.has(following)) return "noon_ikhfa";
  return null;
}

function add(out, ruleCode, wordIndex, wordIndexEnd, triggerText, contextText, expectedBehavior) {
  out.push({
    ruleCode,
    wordIndex,
    wordIndexEnd,
    triggerText,
    contextText,
    expectedBehavior,
  });
}

function extract(ayahText) {
  const words = ayahText.split(/\s+/u).filter(Boolean);
  const out = [];

  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const nextWord = words[index + 1] ?? "";
    const nextLetter = firstBaseLetter(nextWord);
    const cleaned = stripMarks(word);
    const firstLetter = firstBaseLetter(word);
    const lastLetter = lastBaseLetter(word);
    const letters = baseLetters(word);

    if (cleaned.includes("الله")) {
      add(out, "lafz_al_jalalah_lam", index, index, word, word, {
        source: "lafz_al_jalalah",
        requires_acoustic_validation: true,
      });
    } else if (cleaned.startsWith("ال")) {
      const articleTarget = letters[2] ?? null;
      if (articleTarget && SUN_LETTERS.has(articleTarget)) {
        add(out, "lam_shamsiyyah", index, index, word, word, {
          article: "al",
          following_letter: articleTarget,
          assimilation: true,
        });
      } else if (articleTarget && MOON_LETTERS.has(articleTarget)) {
        add(out, "lam_qamariyyah", index, index, word, word, {
          article: "al",
          following_letter: articleTarget,
          assimilation: false,
        });
      }
    }

    if (word.includes("نّ") || word.includes("مّ")) {
      add(out, "ghunnah_mushaddadah", index, index, word, word, {
        nasalization: true,
        duration_class: "ghunnah",
      });
    }

    for (const letter of QALQALAH_LETTERS) {
      if (hasSukunAfter(word, letter)) {
        add(out, "qalqalah", index, index, letter, word, {
          letter,
          cause: "sukun_marked",
          requires_acoustic_validation: true,
        });
      }
    }

    const internalNoonFollowing = firstLetterAfterNoonSukun(word);
    if (internalNoonFollowing) {
      const ruleCode = classifyNoon(internalNoonFollowing);
      if (ruleCode) {
        add(out, ruleCode, index, index, "نْ", word, {
          source: "noon_sakinah",
          following_letter: internalNoonFollowing,
        });
      }
    } else if (lastLetter === "ن" && nextLetter) {
      const ruleCode = classifyNoon(nextLetter);
      if (ruleCode) {
        add(out, ruleCode, index, index + 1, word, nextWord, {
          source: "noon_sakinah",
          following_letter: nextLetter,
        });
      }
    }

    const hasTanween = [...word].some((character) => TANWEEN.has(character));
    if (hasTanween && nextLetter) {
      const ruleCode = classifyNoon(nextLetter);
      if (ruleCode) {
        add(out, ruleCode, index, index + 1, word, nextWord, {
          source: "tanween",
          following_letter: nextLetter,
        });
      }
    }

    if (lastLetter === "م" && nextLetter) {
      const ruleCode =
        nextLetter === "م"
          ? "meem_idgham_shafawi"
          : nextLetter === "ب"
            ? "meem_ikhfa_shafawi"
            : "meem_izhar_shafawi";

      add(out, ruleCode, index, index + 1, word, nextWord, {
        source: "meem_sakinah",
        following_letter: nextLetter,
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
      .select("id,surah_id,ayah_number,text_ar")
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
  const { data, error } = await supabase
    .from("tajweed_rules")
    .select("id,code");

  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((row) => [row.code, row.id]));
}

async function insertBatches(rows) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("tajweed_occurrences")
      .upsert(batch, { onConflict: "ayah_id,rule_id,word_index,word_index_end" });

    if (error) throw new Error(error.message);
    console.log(`tajweed_occurrences: ${Math.min(i + batch.length, rows.length)}/${rows.length}`);
  }
}

const ruleIds = await loadRuleIds();
const ayahs = await fetchAllAyahs();

if (ayahs.length !== 6236) {
  throw new Error(`Expected 6236 ayahs, got ${ayahs.length}`);
}

const { error: deleteError } = await supabase
  .from("tajweed_occurrences")
  .delete()
  .eq("source_version", SOURCE_VERSION);

if (deleteError) throw new Error(deleteError.message);

const rows = [];

for (const ayah of ayahs) {
  for (const occurrence of extract(ayah.text_ar)) {
    const ruleId = ruleIds.get(occurrence.ruleCode);
    if (!ruleId) throw new Error(`Missing tajweed rule: ${occurrence.ruleCode}`);

    rows.push({
      ayah_id: ayah.id,
      rule_id: ruleId,
      word_index: occurrence.wordIndex,
      word_index_end: occurrence.wordIndexEnd,
      trigger_text: occurrence.triggerText,
      context_text: occurrence.contextText,
      expected_behavior: occurrence.expectedBehavior,
      source_version: SOURCE_VERSION,
    });
  }
}

await insertBatches(rows);

const { count, error: countError } = await supabase
  .from("tajweed_occurrences")
  .select("id", { count: "exact", head: true });

if (countError) throw new Error(countError.message);

console.log(JSON.stringify({
  ok: true,
  ayahs: ayahs.length,
  generated: rows.length,
  stored: count,
  source_version: SOURCE_VERSION,
}, null, 2));
