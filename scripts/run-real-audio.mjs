import fs from "node:fs/promises";
import path from "node:path";

const apiUrl = process.env.BURHAN_API_URL?.replace(/\/$/, "");
const apiKey = process.env.BURHAN_API_KEY;
const attemptId =
  process.env.BURHAN_CALIBRATION_ATTEMPT_ID ??
  "b0000000-0000-4000-8000-000000000003";
const questionId =
  process.env.BURHAN_CALIBRATION_QUESTION_ID ??
  "b0000000-0000-4000-8000-000000000002";
const audioPath = process.argv[2];

if (!apiUrl) throw new Error("BURHAN_API_URL is required.");
if (!apiKey) throw new Error("BURHAN_API_KEY is required.");
if (!audioPath) throw new Error("Usage: npm run audio:real -- ./recording.wav");

const MIME_BY_EXTENSION = {
  ".flac": "audio/flac",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".m4a": "audio/m4a",
};

const fileBuffer = await fs.readFile(audioPath);
const extension = path.extname(audioPath).toLowerCase();
const mimeType = MIME_BY_EXTENSION[extension];

if (!mimeType) {
  throw new Error(
    "Unsupported audio extension. Use flac, mp3, mp4, ogg, wav, webm, or m4a.",
  );
}

const form = new FormData();
form.set("attempt_id", attemptId);
form.set("question_id", questionId);
form.set(
  "file",
  new Blob([fileBuffer], { type: mimeType }),
  path.basename(audioPath),
);

const uploadResponse = await fetch(apiUrl + "/api/v1/audio/upload", {
  method: "POST",
  headers: { "x-burhan-api-key": apiKey },
  body: form,
});

const uploadPayload = await uploadResponse.json().catch(() => null);

if (!uploadResponse.ok) {
  throw new Error(
    "Audio upload failed (" +
      uploadResponse.status +
      "): " +
      JSON.stringify(uploadPayload),
  );
}

const analysisResponse = await fetch(
  apiUrl + "/api/v1/tajweed-analysis/run",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-burhan-api-key": apiKey,
    },
    body: JSON.stringify({
      attempt_id: attemptId,
      question_id: questionId,
      audio_url: uploadPayload.audio_url,
    }),
  },
);

const analysisPayload = await analysisResponse.json().catch(() => null);

if (!analysisResponse.ok) {
  throw new Error(
    "Tajweed analysis failed (" +
      analysisResponse.status +
      "): " +
      JSON.stringify(analysisPayload),
  );
}

console.log(
  JSON.stringify(
    {
      calibration: {
        attempt_id: attemptId,
        question_id: questionId,
        audio_path: audioPath,
      },
      upload: {
        bucket: uploadPayload.bucket,
        storage_path: uploadPayload.storage_path,
        expires_in_seconds: uploadPayload.expires_in_seconds,
      },
      result: analysisPayload,
    },
    null,
    2,
  ),
);
