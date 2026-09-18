import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../../../lib/supabase-admin";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const MIME_TO_EXTENSION: Record<string, string> = {
  "audio/flac": "flac",
  "audio/mpeg": "mp3",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
};

const idSchema = z.string().uuid();

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);

  if (!form) {
    return NextResponse.json({ error: "INVALID_MULTIPART_REQUEST" }, { status: 400 });
  }

  const attemptId = String(form.get("attempt_id") ?? "");
  const questionId = String(form.get("question_id") ?? "");
  const file = form.get("file");

  if (!idSchema.safeParse(attemptId).success || !idSchema.safeParse(questionId).success) {
    return NextResponse.json({ error: "INVALID_REQUEST_IDS" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "AUDIO_FILE_REQUIRED" }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        error: "AUDIO_FILE_SIZE_INVALID",
        max_bytes: MAX_AUDIO_BYTES,
      },
      { status: 413 },
    );
  }

  const mimeType = file.type.toLowerCase();
  const extension =
    MIME_TO_EXTENSION[mimeType] ??
    file.name.toLowerCase().split(".").pop() ??
    "";

  if (!MIME_TO_EXTENSION[mimeType] || !["flac", "mp3", "mp4", "ogg", "wav", "webm", "m4a"].includes(extension)) {
    return NextResponse.json(
      {
        error: "AUDIO_MIME_TYPE_NOT_ALLOWED",
        allowed_mime_types: Object.keys(MIME_TO_EXTENSION),
      },
      { status: 415 },
    );
  }

  try {
    const db = getSupabaseAdmin();

    const [{ data: attempt, error: attemptError }, { data: question, error: questionError }] =
      await Promise.all([
        db
          .from("test_attempts")
          .select("id,test_id,submitted_at")
          .eq("id", attemptId)
          .maybeSingle(),
        db
          .from("test_questions")
          .select("id,test_id,question_type")
          .eq("id", questionId)
          .maybeSingle(),
      ]);

    if (attemptError) throw new Error(attemptError.message);
    if (questionError) throw new Error(questionError.message);
    if (!attempt) return NextResponse.json({ error: "ATTEMPT_NOT_FOUND" }, { status: 404 });
    if (!question) return NextResponse.json({ error: "QUESTION_NOT_FOUND" }, { status: 404 });
    if (attempt.submitted_at) {
      return NextResponse.json({ error: "ATTEMPT_ALREADY_SUBMITTED" }, { status: 409 });
    }
    if (question.test_id !== attempt.test_id) {
      return NextResponse.json({ error: "QUESTION_ATTEMPT_MISMATCH" }, { status: 409 });
    }

    const storagePath =
      attempt.id + "/" + question.id + "/" + crypto.randomUUID() + "." + extension;

    const { error: uploadError } = await db.storage
      .from("burhan-audio")
      .upload(storagePath, file, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data: signed, error: signedError } = await db.storage
      .from("burhan-audio")
      .createSignedUrl(storagePath, 60 * 60);

    if (signedError || !signed?.signedUrl) {
      await db.storage.from("burhan-audio").remove([storagePath]);
      throw new Error(signedError?.message ?? "Failed to create signed audio URL.");
    }

    return NextResponse.json({
      bucket: "burhan-audio",
      storage_path: storagePath,
      audio_url: signed.signedUrl,
      expires_in_seconds: 60 * 60,
      file: {
        name: file.name,
        size_bytes: file.size,
        mime_type: mimeType,
        extension,
      },
      test: {
        attempt_id: attempt.id,
        question_id: question.id,
      },
    });
  } catch (error) {
    console.error("Burhan audio upload failed", error);
    return NextResponse.json(
      {
        error: "AUDIO_UPLOAD_ERROR",
        message: error instanceof Error ? error.message : "Unable to upload audio.",
      },
      { status: 500 },
    );
  }
}
