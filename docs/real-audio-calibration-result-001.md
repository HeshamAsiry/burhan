# Real Audio Calibration — Fatiha sample 001

## Run

- Audio: `calibration/audio/001 الفاتحة.mp3`
- Model: `FatimahEmadEldin/wav2vec2-xls-r-300m-iqraeval`
- Sampling rate after conversion: 16 kHz
- Audio duration: 51,100.56 ms
- Chunking: 12.0 s windows with 1.5 s overlap
- Chunks: 5
- Predicted phoneme timings: 213
- Mean frame confidence: 0.95499

The model documentation states that its training utterances were filtered to 0.3–15.0 seconds, so Burhan calibration uses short overlapping chunks for recordings longer than that range.

## Initial Madd acoustic observations

The following are timing proxies from internal long-vowel candidates where the model sequence is consistent with a Madd position. The proxy is derived from neighboring CTC timing boundaries, not from the 20 ms CTC token core itself.

| Context | Model token | Approx. duration |
| --- | --- | ---: |
| الرحمن — internal long vowel | aa | 260 ms |
| مالك — Madd Asli | aa | 260 ms |
| إياك — first occurrence | aa | 210 ms |
| إياك — second occurrence | aa | 220 ms |
| الصراط — internal long vowel | AA | 230 ms |
| الصراط — second occurrence | AA | 220 ms |

The median of these clean internal candidates is approximately 230 ms for this speaker/recording.

End-of-ayah long vowels were not used for the baseline because stopping can change the permissible Madd behavior and the observed acoustic span can include boundary/silence effects.

## Important calibration status

This sample is a successful real-model execution, not a production accuracy validation.

Do **not** set `BURHAN_MADD_REFERENCE_HARAKAH_MS` from this single recording yet. A defensible baseline needs multiple clean recordings from the intended speaker population, plus reference alignment and explicit correct/short/long Madd cases.

The calibration result is kept as a GitHub Actions artifact rather than committed as a generated JSON file.
