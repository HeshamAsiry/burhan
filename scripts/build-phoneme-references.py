import json
import os
import urllib.parse
import urllib.request
import urllib.error
import re
import unicodedata

from quranic_phonemizer import Phonemizer

# Reference alignment is validated through the hosted build workflow.
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


def is_ignorable_alignment_char(value):
    codepoint = ord(value)
    return (
        value.isspace()
        or value == "ـ"
        or 0x06D6 <= codepoint <= 0x06ED
        or unicodedata.category(value)[0] in {"M", "P", "S", "C"}
    )


def alignment_significant(value):
    return not is_ignorable_alignment_char(value)


def is_compact_opening_first_word(word_match, word_index, letter_mappings):
    if word_index != 0 or not letter_mappings:
        return False

    canonical_bases = [
        char for char in word_match.group()
        if alignment_significant(char)
    ]

    first_chars = str(letter_mappings[0].get("chars", "")).strip()
    first_bases = [
        char for char in first_chars
        if alignment_significant(char)
    ]

    return (
        len(canonical_bases) == 1
        and len(first_bases) == 1
        and canonical_bases[0] == first_bases[0]
        and len(letter_mappings[0].get("phonemes", [])) > 1
    )


def locate_exact(source, needle, start, reference):
    """
    Align a phonemizer mapping against canonical Qur'anic text.

    Mapping chunks may contain combining marks, pause symbols, or other
    annotation-only scalars that are absent from the canonical text. Match
    significant Arabic characters in order and treat annotation-only chunks
    as zero-width/virtual spans.
    """
    significant = [char for char in needle if alignment_significant(char)]

    if not significant:
        return start, start

    source_index = start
    match_start = None
    match_end = start

    for expected in significant:
        while (
            source_index < len(source)
            and source[source_index] != expected
            and is_ignorable_alignment_char(source[source_index])
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
        match_end = source_index

    return match_start, match_end

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
            not is_ignorable_alignment_char(char)
            for char in remaining
        ):
            raise RuntimeError(
                "Letter/phoneme mapping did not cover canonical text for "
                + reference
                + "; remaining="
                + repr(remaining)
            )

    return mappings


def build_tajweed_mappings(
    result,
    canonical_text,
    reference,
    letter_mappings,
):
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

        # Muqattaat slots use an extra zero-based location component, e.g.
        # 2:1:1:0, 2:1:1:1, 2:1:1:2. They can appear only at the beginning
        # of an ayah; later ordinary words keep the normal 3-part location.
        # Project each named slot onto the corresponding compact canonical
        # grapheme from letter_phoneme_mappings.
        if len(parts) >= 4 and parts[-1].isdigit():
            slot_index = int(parts[-1])
            slot = (
                letter_mappings[slot_index]
                if 0 <= slot_index < len(letter_mappings)
                else None
            )
            entries = []
            for entry in mapping.get("entries", []):
                char = str(entry.get("char", ""))
                if not char:
                    continue
                entries.append(
                    {
                        "char": char,
                        "char_start": slot["char_start"] if slot else -1,
                        "char_end": slot["char_end"] if slot else -1,
                        "source_rules": entry.get("source_rules", []),
                        "target_rules": entry.get("target_rules", []),
                        "virtual": slot is None,
                    }
                )
            mapped.append(
                {
                    "location": location,
                    "entries": entries,
                    "virtual_word": True,
                }
            )
            continue

        # A malformed or otherwise unmappable word location must not corrupt
        # the canonical alignment. Preserve the rule entries as virtual data
        # rather than guessing a character span.
        # single canonical token, while the phonemizer expands their named
        # letters into multiple internal word slots. Preserve those Tajweed
        # entries, but do not invent character offsets in canonical text.
        if word_index < 0 or word_index >= len(word_matches):
            entries = []
            for entry in mapping.get("entries", []):
                char = str(entry.get("char", ""))
                if not char:
                    continue
                entries.append(
                    {
                        "char": char,
                        "char_start": -1,
                        "char_end": -1,
                        "source_rules": entry.get("source_rules", []),
                        "target_rules": entry.get("target_rules", []),
                        "virtual": True,
                    }
                )
            mapped.append(
                {
                    "location": location,
                    "entries": entries,
                    "virtual_word": True,
                }
            )
            continue

        word_match = word_matches[word_index]

        # Some single-letter muqattaat openings (for example صٓ) use a
        # three-part Tajweed location while the phonemizer internally expands
        # the named letter into multiple pronunciation slots. In that case the
        # Tajweed entries (ص, ا, د) describe the named letter, not literal
        # characters in the compact Uthmani token. Anchor them to the first
        # compact grapheme rather than inventing separate character spans.
        if is_compact_opening_first_word(
            word_match,
            word_index,
            letter_mappings,
        ):
            slot = letter_mappings[0]
            entries = []
            for entry in mapping.get("entries", []):
                char = str(entry.get("char", ""))
                if not char:
                    continue
                entries.append(
                    {
                        "char": char,
                        "char_start": slot["char_start"],
                        "char_end": slot["char_end"],
                        "source_rules": entry.get("source_rules", []),
                        "target_rules": entry.get("target_rules", []),
                        "virtual": True,
                    }
                )

            mapped.append(
                {
                    "location": location,
                    "entries": entries,
                    "virtual_word": True,
                }
            )
            continue

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
        letter_mappings,
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
