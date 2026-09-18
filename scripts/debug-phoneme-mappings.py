import ast
from pathlib import Path
from quranic_phonemizer import Phonemizer

source = Path("scripts/build-phoneme-references.py").read_text(encoding="utf-8")
tree = ast.parse(source)

nodes = []
for node in tree.body:
    if isinstance(node, (ast.Import, ast.ImportFrom, ast.Assign, ast.FunctionDef)):
        nodes.append(node)

namespace = {"__name__": "alignment_test"}
exec(compile(ast.Module(body=nodes, type_ignores=[]), "alignment_test", "exec"), namespace)

canonical = {
    "1:1": "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
    "2:1": "الٓمٓ",
    "10:1": "الٓر ۚ تِلْكَ ءَايَـٰتُ ٱلْكِتَـٰبِ ٱلْحَكِيمِ",
    "27:36": "فَلَمَّا جَآءَ سُلَيْمَـٰنَ قَالَ أَتُمِدُّونَنِ بِمَالٍۢ فَمَآ ءَاتَىٰنِۦَ ٱللَّهُ خَيْرٌۭ مِّمَّآ ءَاتَىٰكُم بَلْ أَنتُم بِهَدِيَّتِكُمْ تَفْرَحُونَ",
    "38:1": "صٓ ۚ وَٱلْقُرْءَانِ ذِى ٱلذِّكْرِ",
}

pm = Phonemizer()

for ref, text in canonical.items():
    result = pm.phonemize(ref)
    print("\n== " + ref + " ==", flush=True)

    letter_mappings = namespace["build_letter_phoneme_mappings"](
        result,
        text,
        ref,
    )
    print("letter mappings: OK (" + str(len(letter_mappings)) + ")", flush=True)

    tajweed_mappings = namespace["build_tajweed_mappings"](
        result,
        text,
        ref,
        letter_mappings,
    )
    print("tajweed mappings: OK (" + str(len(tajweed_mappings)) + ")", flush=True)

print("\nALL ALIGNMENT TESTS PASSED", flush=True)
