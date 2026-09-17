# Tajweed Knowledge Map

The Tajweed analyzer does not learn the expected rule from the audio alone.

Burhan first builds an expected Quran-side map:

Quran text → rule occurrence → expected behavior → audio analysis

## Current deterministic layer

The first knowledge-map detector covers:

- Noon sakinah and tanween: Izhar, Idgham with ghunnah, Idgham without ghunnah, Iqlab, and Ikhfa.
- Meem sakinah: Shafawi Idgham, Shafawi Ikhfa, and Shafawi Izhar.
- Mushaddad noon/mim ghunnah.
- Qalqalah locations where a sukun mark is explicitly present.
- Lam shamsiyyah and lam qamariyyah.

The stored occurrence is deliberately small and model-friendly:

- ayah
- word range
- trigger text
- context text
- expected behavior
- rule code
- map version

## Planned acoustic rules

Madd timing, detailed Raa tafkhim/tarqiq, Waqf/Ibtida, and finer Sifat/Makhraj judgments require additional contextual and acoustic analysis. They are not marked as automatically verified by this deterministic text layer.

The canonical Quran text remains unchanged. The knowledge map is derived metadata only.
