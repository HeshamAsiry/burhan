export type QuranPhonemeReference = {
  phonemes: string[];
  phoneme_version: string;
  source: string;
};

function endpointUrl() {
  const raw = process.env.BURHAN_PHONEMIZER_URL?.trim();

  if (!raw) {
    throw new Error("BURHAN_PHONEMIZER_URL is not configured.");
  }

  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("Burhan phonemizer URL must use HTTPS.");
  }

  return url;
}

export async function phonemizeQuranAyah(input: {
  text_ar: string;
  surah_id: number;
  ayah_number: number;
}): Promise<QuranPhonemeReference> {
  const url = endpointUrl();
  const token = process.env.BURHAN_PHONEMIZER_TOKEN?.trim();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify({
      text_ar: input.text_ar,
      surah_id: input.surah_id,
      ayah_number: input.ayah_number,
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).error === "string"
        ? String((payload as Record<string, unknown>).error)
        : "Quran phonemizer failed.";

    throw new Error(message);
  }

  if (!Array.isArray(payload?.phonemes)) {
    throw new Error("Quran phonemizer returned no phonemes.");
  }

  const phonemes = payload.phonemes
    .map((value: unknown) => String(value).trim())
    .filter(Boolean);

  if (!phonemes.length) {
    throw new Error("Quran phonemizer returned an empty phoneme sequence.");
  }

  if (phonemes.length > 5000) {
    throw new Error("Quran phonemizer returned too many phonemes.");
  }

  const phonemeVersion =
    typeof payload.phoneme_version === "string" &&
    payload.phoneme_version.trim()
      ? payload.phoneme_version.trim()
      : "unknown";

  const source =
    typeof payload.source === "string" && payload.source.trim()
      ? payload.source.trim()
      : url.hostname;

  return {
    phonemes,
    phoneme_version: phonemeVersion,
    source,
  };
}
