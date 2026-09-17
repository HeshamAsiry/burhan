import type { QuestionEvaluation } from "./evaluator";
import { evaluateQuestion } from "./evaluator";

export type AudioSubmission = {
  audio_url?: string;
  duration_ms?: number;
  mime_type?: string;
  transcript: string;
  transcription_provider?: string;
  transcription_confidence?: number;
  transcription_language?: string;
};

export type AudioEvaluation = {
  mode: "audio_transcript";
  transcript: string;
  transcription: {
    provider: string | null;
    confidence: number | null;
    language: string;
  };
  audio: {
    url: string | null;
    duration_ms: number | null;
    mime_type: string | null;
  };
  evaluation: QuestionEvaluation;
};

export function evaluateAudioTranscript(
  question: { id: string; question_type: string; expected_answer: any },
  submission: AudioSubmission,
): AudioEvaluation {
  if (!submission.transcript.trim()) {
    throw new Error("Transcript is required for audio evaluation.");
  }

  const evaluation = evaluateQuestion(question, {
    text: submission.transcript,
  });

  return {
    mode: "audio_transcript",
    transcript: submission.transcript,
    transcription: {
      provider: submission.transcription_provider ?? null,
      confidence: submission.transcription_confidence ?? null,
      language: submission.transcription_language ?? "ar",
    },
    audio: {
      url: submission.audio_url ?? null,
      duration_ms: submission.duration_ms ?? null,
      mime_type: submission.mime_type ?? null,
    },
    evaluation,
  };
}
