const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "flac",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "m4a",
  "ogg",
  "wav",
  "webm",
]);

function allowedHosts() {
  const configured = process.env.BURHAN_AUDIO_ALLOWED_HOSTS
    ?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (configured?.length) return configured;

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is required for audio URL validation.");
  }

  return [new URL(supabaseUrl).hostname.toLowerCase()];
}

export function validateAudioUrl(rawUrl: string) {
  const url = new URL(rawUrl);

  if (url.protocol !== "https:") {
    throw new Error("Audio URL must use HTTPS.");
  }

  if (!allowedHosts().includes(url.hostname.toLowerCase())) {
    throw new Error("Audio URL host is not allowed.");
  }

  const extension = url.pathname.split(".").pop()?.toLowerCase();
  if (extension && !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported audio file extension.");
  }

  return url;
}

export { MAX_AUDIO_BYTES };
