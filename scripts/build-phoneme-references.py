import json
import os
import urllib.parse
import urllib.request
import urllib.error

from quranic_phonemizer import Phonemizer

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BATCH_SIZE = int(os.environ.get("PHONEME_REFERENCE_BATCH_SIZE", "50"))
PHONEMIZER_VERSION = "quranic-phonemizer@2.9.0"
PHONEMIZER_SOURCE = "Hetchy/Quranic-Phonemizer"

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")

if BATCH_SIZE < 1:
    raise RuntimeError("PHONEME_REFERENCE_BATCH_SIZE must be at least 1.")


def request_json(method, path, payload=None, headers=None):
    url = SUPABASE_URL + "/rest/v1/" + path.lstrip("/")
    body = None
    request_headers = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": "Bearer " + SERVICE_ROLE_KEY,
        "Accept": "application/json",
    }
    if headers:
        request_headers.update(headers)
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        url,
        data=body,
        headers=request_headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            "Supabase REST request failed (" + str(exc.code) + "): " + detail
        ) from exc


def fetch_all_ayahs():
    rows = []
    page_size = 1000

    for offset in range(0, 10000, page_size):
        query = urllib.parse.urlencode(
            {
                "select": "id,surah_id,ayah_number,text_ar",
                "order": "surah_id.asc,ayah_number.asc",
                "limit": page_size,
                "offset": offset,
            }
        )
        page = request_json("GET", "ayahs?" + query)
        if not page:
            break

        rows.extend(page)
        if len(page) < page_size:
            break

    return rows


def phonemize(phonemizer, ayah):
    reference = str(ayah["surah_id"]) + ":" + str(ayah["ayah_number"])
    result = phonemizer.phonemize(reference)

    phonemes = result.phonemes_str(
        phoneme_sep=" ",
        word_sep=" ",
        verse_sep=" ",
    ).split()

    if not phonemes:
        raise RuntimeError("Empty phoneme reference for " + reference)

    return {
        "ayah_id": ayah["id"],
        "phoneme_version": PHONEMIZER_VERSION,
        "phonemes": phonemes,
        "source": PHONEMIZER_SOURCE,
    }


def upsert(rows):
    request_json(
        "POST",
        "quran_phoneme_references?on_conflict=ayah_id",
        rows,
        headers={"Prefer": "resolution=merge-duplicates"},
    )


ayahs = fetch_all_ayahs()

if len(ayahs) != 6236:
    raise RuntimeError("Expected 6236 ayahs, got " + str(len(ayahs)))

phonemizer = Phonemizer()
batch = []

for index, ayah in enumerate(ayahs, start=1):
    batch.append(phonemize(phonemizer, ayah))

    if len(batch) >= BATCH_SIZE or index == len(ayahs):
        upsert(batch)
        batch.clear()
        print(
            "phoneme references: " + str(index) + "/" + str(len(ayahs)),
            flush=True,
        )

print(
    json.dumps(
        {
            "ok": True,
            "ayahs": len(ayahs),
            "stored_references": "upserted",
            "phoneme_version": PHONEMIZER_VERSION,
            "source": PHONEMIZER_SOURCE,
        },
        ensure_ascii=False,
        indent=2,
    )
)
