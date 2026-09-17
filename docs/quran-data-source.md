# Quran data source

## Source

Burhan uses the Tanzil Quran Text (Uthmani) as its initial canonical Arabic text source.

Tanzil describes its Uthmani text as matching the Medina Mushaf and provides downloadable Quran text and metadata resources.

- https://tanzil.net/docs/download
- https://tanzil.net/docs/uthmani
- https://tanzil.net/docs/Quran_Metadata

## License / attribution

Tanzil permits copying and distribution of verbatim copies under its terms, requires the source to be clearly indicated, requires a link to tanzil.net, and does not permit changing the supplied text.

For Burhan, the canonical `text_ar` field must remain the verbatim source text. Any search/normalization representation must be stored separately and must never replace the canonical Quran text.

Required attribution should travel with the dataset and public API documentation.

## Ingestion rule

1. Download a pinned Tanzil release.
2. Preserve the exact source text.
3. Validate surah and ayah counts.
4. Import structural metadata separately.
5. Generate `normalized_text` only as a derived search index.
6. Never mutate `text_ar` during normalization.
7. Record source version/checksum for reproducibility.
