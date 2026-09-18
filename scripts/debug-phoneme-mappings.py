import json
from quranic_phonemizer import Phonemizer

pm = Phonemizer()

for ref in ("1:1", "2:1", "2:2", "2:5"):
    print("\n=== " + ref + " ===", flush=True)
    result = pm.phonemize(ref)

    print("phonemes:", result.phonemes_str(phoneme_sep=" ", word_sep=" ", verse_sep=" "), flush=True)

    print("letter_mappings:", flush=True)
    for chars, phonemes in result.letter_phoneme_mappings().to_list():
        print("  chars=" + repr(chars) + " phonemes=" + repr(phonemes), flush=True)

    raw = json.loads(result.tajweed_mappings().to_json())
    print("tajweed_payload_type:", type(raw).__name__, flush=True)
    print("tajweed_payload_keys:", list(raw.keys()) if isinstance(raw, dict) else None, flush=True)
    words = raw.get("words", []) if isinstance(raw, dict) else raw
    print("tajweed_words_count:", len(words), flush=True)

    for word in words:
        print(
            "  location=" + repr(word.get("location"))
            + " stopping=" + repr(word.get("is_stopping")),
            flush=True,
        )
        for entry in word.get("entries", []):
            print(
                "    char=" + repr(entry.get("char"))
                + " source=" + repr(entry.get("source_rules"))
                + " target=" + repr(entry.get("target_rules")),
                flush=True,
            )
