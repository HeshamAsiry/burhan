import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const TEXT_URL = process.env.TANZIL_TEXT_URL || "https://tanzil.net/pub/quran-uthmani.xml";
const METADATA_URL = process.env.TANZIL_METADATA_URL || "https://tanzil.net/pub/quran-data.xml";
const SOURCE_NAME = "Tanzil Quran Text - Uthmani";
const SOURCE_VERSION = "1.1";
const BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE || 500);

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizeArabic(input) {
  return input
    .normalize("NFKC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[إأٱآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(fragment) {
  const attrs = {};
  for (const match of fragment.matchAll(/([A-Za-z]+)="([^"]*)"/g)) {
    attrs[match[1].toLowerCase()] = xmlEntities(match[2]);
  }
  return attrs;
}

function parseTextXml(xml) {
  const surahs = [];
  for (const suraMatch of xml.matchAll(/<sura\b([^>]*)>([\s\S]*?)<\/sura>/g)) {
    const suraAttrs = parseAttributes(suraMatch[1]);
    const ayahs = [];
    for (const ayaMatch of suraMatch[2].matchAll(/<aya\b([^>]*)>([\s\S]*?)<\/aya>/g)) {
      const attrs = parseAttributes(ayaMatch[1]);
      ayahs.push({
        number: Number(attrs.index),
        text: ayaMatch[2],
      });
    }
    surahs.push({ number: Number(suraAttrs.index), name: suraAttrs.name || "", ayahs });
  }
  if (surahs.length !== 114) throw new Error(`Expected 114 surahs, got ${surahs.length}`);
  const ayahCount = surahs.reduce((sum, s) => sum + s.ayahs.length, 0);
  if (ayahCount !== 6236) throw new Error(`Expected 6236 ayahs, got ${ayahCount}`);
  return surahs;
}

function parseMetadata(xml) {
  const result = {
    surahs: new Map(),
    juz: [],
    pages: [],
    quarters: [],
  };
  const surasBlock = xml.match(/<suras\b[^>]*>([\s\S]*?)<\/suras>/)?.[1] || "";
  for (const match of surasBlock.matchAll(/<sura\b([^\/]*)\/>/g)) {
    const a = parseAttributes(match[1]);
    result.surahs.set(Number(a.index), a);
  }
  const juzBlock = xml.match(/<juzs\b[^>]*>([\s\S]*?)<\/juzs>/)?.[1] || "";
  for (const match of juzBlock.matchAll(/<juz\b([^\/]*)\/>/g)) result.juz.push(parseAttributes(match[1]));
  const pagesBlock = xml.match(/<pages\b[^>]*>([\s\S]*?)<\/pages>/)?.[1] || "";
  for (const match of pagesBlock.matchAll(/<page\b([^\/]*)\/>/g)) result.pages.push(parseAttributes(match[1]));
  const hizbBlock = xml.match(/<hizbs\b[^>]*>([\s\S]*?)<\/hizbs>/)?.[1] || "";
  for (const match of hizbBlock.matchAll(/<quarter\b([^\/]*)\/>/g)) result.quarters.push(parseAttributes(match[1]));
  if (result.juz.length !== 30) throw new Error(`Expected 30 juz boundaries, got ${result.juz.length}`);
  if (result.pages.length !== 604) throw new Error(`Expected 604 page boundaries, got ${result.pages.length}`);
  if (result.quarters.length !== 240) throw new Error(`Expected 240 hizb-quarter boundaries, got ${result.quarters.length}`);
  return result;
}

function boundaryLookup(boundaries, surah, ayah) {
  let value = 1;
  for (const b of boundaries) {
    const bs = Number(b.sura);
    const ba = Number(b.aya);
    if (bs < surah || (bs === surah && ba <= ayah)) value = Number(b.index);
    else break;
  }
  return value;
}

async function upsertBatches(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table} import failed: ${error.message}`);
    console.log(`${table}: ${Math.min(i + batch.length, rows.length)}/${rows.length}`);
  }
}

const [textResponse, metadataResponse] = await Promise.all([fetch(TEXT_URL), fetch(METADATA_URL)]);
if (!textResponse.ok) throw new Error(`Tanzil text download failed: ${textResponse.status}`);
if (!metadataResponse.ok) throw new Error(`Tanzil metadata download failed: ${metadataResponse.status}`);
const textXml = await textResponse.text();
const metadataXml = await metadataResponse.text();
const checksum = crypto.createHash("sha256").update(textXml, "utf8").digest("hex");

const surahs = parseTextXml(textXml);
const metadata = parseMetadata(metadataXml);

const { data: source, error: sourceError } = await supabase
  .from("quran_sources")
  .upsert({ name: SOURCE_NAME, version: SOURCE_VERSION, source_url: TEXT_URL, license: "CC BY 3.0 / Tanzil Terms of Use", checksum, imported_at: new Date().toISOString(), is_active: true }, { onConflict: "name,version" })
  .select("id")
  .single();
if (sourceError) throw new Error(`quran_sources import failed: ${sourceError.message}`);

const surahRows = surahs.map((s) => {
  const m = metadata.surahs.get(s.number) || {};
  return {
    number: s.number,
    name_ar: s.name || m.name || "",
    name_en: m.ename || "",
    revelation_order: Number(m.order || 0),
    ayah_count: s.ayahs.length,
  };
});
await upsertBatches("surahs", surahRows, "number");

const { data: dbSurahs, error: dbSurahsError } = await supabase.from("surahs").select("id,number").order("number");
if (dbSurahsError) throw new Error(dbSurahsError.message);
const surahIdByNumber = new Map(dbSurahs.map((s) => [s.number, s.id]));

const ayahRows = [];
for (const surah of surahs) {
  const surahId = surahIdByNumber.get(surah.number);
  if (!surahId) throw new Error(`Missing database surah ${surah.number}`);
  for (const aya of surah.ayahs) {
    ayahRows.push({
      surah_id: surahId,
      ayah_number: aya.number,
      text_ar: aya.text,
      normalized_text: normalizeArabic(aya.text),
      page_number: boundaryLookup(metadata.pages, surah.number, aya.number),
      juz_number: boundaryLookup(metadata.juz, surah.number, aya.number),
      hizb_number: Math.ceil(boundaryLookup(metadata.quarters, surah.number, aya.number) / 4),
      rub_number: boundaryLookup(metadata.quarters, surah.number, aya.number),
      source_id: source.id,
    });
  }
}
await upsertBatches("ayahs", ayahRows, "surah_id,ayah_number");

const { count: finalCount, error: countError } = await supabase.from("ayahs").select("id", { count: "exact", head: true });
if (countError) throw new Error(countError.message);
if (finalCount !== 6236) throw new Error(`Post-import verification failed: ${finalCount} ayahs`);

console.log(JSON.stringify({ ok: true, source: SOURCE_NAME, version: SOURCE_VERSION, checksum, surahs: 114, ayahs: finalCount }, null, 2));
