import json
import os
import urllib.parse
import urllib.request
import urllib.error
import re
import unicodedata

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


def locate_exact(source, needle, start, reference):
    """
    Align a phonemizer mapping against canonical Qur'anic text.

    The phonemizer intentionally omits Arabic combining marks from many
    mapping chunks, while the canonical text preserves them. Match the
    semantic characters in order and skip intervening combining marks that
    are not present in the mapping chunk.
    """
    source_index = start
    match_start = None

    for expected in needle:
        while (
            source_index < len(source)
            and source[source_index] != expected
            and (
                source[source_index] == "ـ"
                or unicodedata.category(source[source_index])[0] in {"M", "P", "C"}
            )
        ):
            source_index += 1

        if source_index >= len(source) or source[source_index] != expected:
            raise RuntimeError(
                "Could not align mapping "
                + repr(needle)
                + " in canonical text for "
                + reference
            )

        if match_start is None:
            match_start = source_index

        source_index += 1

    if match_start is None:
        raise RuntimeError(
            "Empty mapping cannot be aligned for " + reference
        )

    return match_start, source_index


def build_letter_phoneme_mappings(result, canonical_text, reference):
    mappings = []
    char_cursor = 0
    phoneme_cursor = 0

    for chars, phoneme_list in result.letter_phoneme_mappings().to_list():
        char_start, char_end = locate_exact(
            canonical_text,
            chars,
            char_cursor,
            reference,
        )

        phoneme_start = phoneme_cursor
        phoneme_end = phoneme_start + len(phoneme_list)

        mappings.append(
            {
                "chars": chars,
                "phonemes": phoneme_list,
                "char_start": char_start,
                "char_end": char_end,
                "phoneme_start": phoneme_start,
                "phoneme_end": phoneme_end,
            }
        )

        char_cursor = char_end
        phoneme_cursor = phoneme_end

    if char_cursor != len(canonical_text):
        remaining = canonical_text[char_cursor:]
        if any(
            not (
                char == "ـ"
                or unicodedata.category(char)[0] in {"M", "P", "C"}
                or char.isspace()
            )
            for char in remaining
        ):
            raise RuntimeError(
                "Letter/phoneme mapping did not cover canonical text for "
                + reference
                + "; remaining="
                + repr(remaining)
            )

    return mappings


def build_tajweed_mappings(result, canonical_text, reference):
    raw_mappings = json.loads(result.tajweed_mappings().to_json())
    mappings = (
        raw_mappings.get("words", [])
        if isinstance(raw_mappings, dict)
        else raw_mappings
    )

    if not isinstance(mappings, list):
        raise RuntimeError("Invalid tajweed mappings payload for " + reference)

    word_matches = [
        match
        for match in re.finditer(r"\S+", canonical_text)
        if any(unicodedata.category(char).startswith("L") for char in match.group())
    ]
    mapped = []

    for mapping in mappings:
        location = str(mapping.get("location", ""))
        parts = location.split(":")
        if len(parts) < 3 or not parts[-1].isdigit():
            raise RuntimeError("Invalid tajweed mapping location for " + reference)

        word_index = int(parts[-1]) - 1
        if word_index < 0 or word_index >= len(word_matches):
            raise RuntimeError(
                "Tajweed word index is outside canonical text for " + reference
            )

        word_match = word_matches[word_index]
        cursor = word_match.start()
        entries = []

        for entry in mapping.get("entries", []):
            char = str(entry.get("char", ""))
            if not char:
                continue

            try:
                char_start, char_end = locate_exact(
                    canonical_text,
                    char,
                    cursor,
                    reference,
                )
                virtual = False
            except RuntimeError:
                # The phonemizer may expose a Tajweed grapheme (for example
                # dagger alif) that is semantically present in the reading
                # model but is not encoded as a literal code point in our
                # canonical Uthmani text. Preserve the rule entry and anchor
                # it at the current canonical position without inventing text.
                if any(unicodedata.category(ch).startswith("M") for ch in char):
                    char_start = cursor
                    char_end = cursor
                    virtual = True
                else:
                    raise

            if char_start > word_match.end():
                raise RuntimeError(
                    "Tajweed mapping crossed word boundary for " + reference
                )

            if char_end > word_match.end():
                raise RuntimeError(
                    "Tajweed mapping exceeded word boundary for " + reference
                )

            entries.append(
                {
                    "char": char,
                    "char_start": char_start,
                    "char_end": char_end,
                    "source_rules": entry.get("source_rules", []),
                    "target_rules": entry.get("target_rules", []),
                    "virtual": virtual,
                }
            )
            cursor = char_end

        mapped.append(
            {
                "location": location,
                "entries": entries,
            }
        )

    return mapped


def phonemize(phonemizer, ayah):
    reference = str(ayah["surah_id"]) + ":" + str(ayah["ayah_number"])
    canonical_text = ayah["text_ar"]
    result = phonemizer.phonemize(reference)

    phonemes = result.phonemes_str(
        phoneme_sep=" ",
        word_sep=" ",
        verse_sep=" ",
    ).split()

    if not phonemes:
        raise RuntimeError("Empty phoneme reference for " + reference)

    letter_mappings = build_letter_phoneme_mappings(
        result,
        canonical_text,
        reference,
    )
    tajweed_mappings = build_tajweed_mappings(
        result,
        canonical_text,
        reference,
    )

    if not letter_mappings:
        raise RuntimeError("Empty letter/phoneme mapping for " + reference)

    if not tajweed_mappings:
        raise RuntimeError("Empty tajweed mapping for " + reference)

    return {
        "ayah_id": ayah["id"],
        "phoneme_version": PHONEMIZER_VERSION,
        "phonemes": phonemes,
        "letter_phoneme_mappings": letter_mappings,
        "tajweed_mappings": tajweed_mappings,
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
