import json
from http.server import BaseHTTPRequestHandler

from quranic_phonemizer import Phonemizer

PHONEMIZER_VERSION = "quranic-phonemizer@2.9.0"
PHONEMIZER_SOURCE = "Hetchy/Quranic-Phonemizer"

_phonemizer = Phonemizer()


def _json(handler, status, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json(handler):
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError:
        length = 0

    if length <= 0 or length > 64 * 1024:
        raise ValueError("Request body is missing or too large.")

    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Request body must be valid UTF-8 JSON.") from exc


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        _json(
            self,
            200,
            {
                "ok": True,
                "service": "burhan-quranic-phonemizer",
                "phoneme_version": PHONEMIZER_VERSION,
                "source": PHONEMIZER_SOURCE,
            },
        )

    def do_POST(self):
        try:
            payload = _read_json(self)

            text_ar = str(payload.get("text_ar") or "").strip()
            surah_id = int(payload.get("surah_id"))
            ayah_number = int(payload.get("ayah_number"))

            if not text_ar:
                raise ValueError("text_ar is required.")
            if not 1 <= surah_id <= 114:
                raise ValueError("surah_id must be between 1 and 114.")
            if ayah_number < 1:
                raise ValueError("ayah_number must be positive.")

            # Use the canonical Qur'an reference rather than fuzzy text matching.
            # This prevents a caller's text normalization from changing the
            # phoneme reference.
            result = _phonemizer.phonemize(f"{surah_id}:{ayah_number}")

            canonical_text = result.text()
            phonemes = result.phonemes_str(
                phoneme_sep=" ",
                word_sep=" ",
                verse_sep=" ",
            ).split()

            if not phonemes:
                raise RuntimeError("Phonemizer returned an empty phoneme sequence.")

            _json(
                self,
                200,
                {
                    "phonemes": phonemes,
                    "phoneme_version": PHONEMIZER_VERSION,
                    "source": PHONEMIZER_SOURCE,
                    "reference": f"{surah_id}:{ayah_number}",
                    "canonical_text_ar": canonical_text,
                },
            )
        except ValueError as exc:
            _json(self, 400, {"error": str(exc)})
        except Exception as exc:
            _json(
                self,
                500,
                {
                    "error": "Phonemizer failed.",
                    "detail": str(exc),
                },
            )

    def log_message(self, format, *args):
        return
