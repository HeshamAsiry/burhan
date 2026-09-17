import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const batchSize = Number(process.env.PHONEME_REFERENCE_BATCH_SIZE || 50);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const phonemizerUrl = process.env.BURHAN_PHONEMIZER_URL?.trim();
if (!phonemizerUrl) {
  throw new Error("BURHAN_PHONEMIZER_URL is required.");
}

const url = new URL(phonemizerUrl);
if (url.protocol !== "https:") {
  throw new Error("BURHAN_PHONEMIZER_URL must use HTTPS.");
}

const token = process.env.BURHAN_PHONEMIZER_TOKEN?.trim();
const defaultVersion =
  process.env.BURHAN_PHONEMIZER_VERSION?.trim() || "unknown";
const defaultSource =
  process.env.BURHAN_PHONEMIZER_SOURCE?.trim() || url.hostname;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAllAyahs() {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("ayahs")
      .select("id,surah_id,ayah_number,text_ar")
      .order("surah_id")
      .order("ayah_number")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    rows.push(...data);

    if (data.length < pageSize) break;
  }

  return rows;
}

async function phonemize(ayah) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify({
      text_ar: ayah.text_ar,
      surah_id: ayah.surah_id,
      ayah_number: ayah.ayah_number,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Phonemizer failed with HTTP " + response.status,
    );
  }

  if (!Array.isArray(payload?.phonemes)) {
    throw new Error("Phonemizer response has no phonemes.");
  }

  const phonemes = payload.phonemes
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!phonemes.length) {
    throw new Error(
      `Empty phoneme reference for ${ayah.surah_id}:${ayah.ayah_number}`,
    );
  }

  return {
    ayah_id: ayah.id,
    phoneme_version:
      typeof payload.phoneme_version === "string" &&
      payload.phoneme_version.trim()
        ? payload.phoneme_version.trim()
        : defaultVersion,
    phonemes,
    source:
      typeof payload.source === "string" && payload.source.trim()
        ? payload.source.trim()
        : defaultSource,
  };
}

const ayahs = await fetchAllAyahs();

if (ayahs.length !== 6236) {
  throw new Error(`Expected 6236 ayahs, got ${ayahs.length}`);
}

const rows = [];

for (let i = 0; i < ayahs.length; i++) {
  const row = await phonemize(ayahs[i]);
  rows.push(row);

  if (rows.length >= batchSize || i === ayahs.length - 1) {
    const { error } = await supabase
      .from("quran_phoneme_references")
      .upsert(rows.splice(0, rows.length), {
        onConflict: "ayah_id",
      });

    if (error) throw new Error(error.message);

    console.log(`phoneme references: ${i + 1}/${ayahs.length}`);
  }
}

const { count, error } = await supabase
  .from("quran_phoneme_references")
  .select("id", { count: "exact", head: true });

if (error) throw new Error(error.message);

console.log(
  JSON.stringify(
    {
      ok: true,
      ayahs: ayahs.length,
      stored_references: count,
    },
    null,
    2,
  ),
);
