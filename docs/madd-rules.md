# Quran madd rules in Burhan

Burhan models madd in two separate stages.

## 1. Text-side rule detection

The knowledge map identifies the location and cause of the madd:

- Madd asli (natural)
- Madd badal
- Madd muttasil
- Madd munfasil
- Madd lazim kalimi muthaqqal
- Madd lazim kalimi mukhaffaf
- Madd arid li-sukun (conditional on waqf)
- Madd leen (conditional on waqf)
- Madd iwad (conditional on waqf)
- Madd tamkin (planned contextual rule)
- Harfi natural madd (planned for the disjoint letter openings)

Planned special cases:

- Madd silah qasirah
- Madd silah kubra
- Madd lazim harfi
- Madd farq

## 2. Audio-side measurement

The map must not assume that a learner actually produced the expected duration.

The acoustic layer will later measure:

- detected onset/offset
- duration
- estimated harakah-equivalent duration
- confidence
- whether the learner was connecting or stopping
- deviation from the selected qira'ah/tariq profile

For example, natural madd has a two-harakah reference in the referenced Hafs-oriented setup, while madd lazim has a six-harakah reference in the cited source. Other madd types should use a configured reading-route profile instead of a universal hard-coded number. 

The final verdict can therefore be:

- verified
- detected_issue
- needs_teacher_review
- not_assessed

A duration result with weak audio evidence should go to teacher review instead of becoming an automatic error.
