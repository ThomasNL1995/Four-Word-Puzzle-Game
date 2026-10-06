"""Build the word lists used by the game, for each word length (4, 5 and 6 letters).

  src/data/<n>/valid-words.json  Big, permissive list (SCOWL size <= 70). Used to reject
                                 puzzles with a second solution and to recognise
                                 "real word, wrong answer".
  scripts/words/<n>/answers.json Small, friendly list: common SCOWL words (size <= 50),
                                 no plurals, ranked by wordfreq Zipf frequency, minus the
                                 rejects in scripts/words/<n>/review.json.

Usage (from repo root):
  python3 -m venv .venv && .venv/bin/pip install wordfreq
  .venv/bin/python scripts/build-wordlists.py          # all lengths
  .venv/bin/python scripts/build-wordlists.py 5 6      # only these lengths

SCOWL: http://wordlist.aspell.net (MIT-like license)
wordfreq: https://github.com/rspeer/wordfreq (Apache-2.0, data CC BY-SA 4.0)
"""

import glob
import json
import os
import re
import sys
import tarfile
import urllib.request

from wordfreq import zipf_frequency

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "scripts", ".cache")
SCOWL_VERSION = "2020.12.07"
SCOWL_URL = f"https://downloads.sourceforge.net/project/wordlist/SCOWL/{SCOWL_VERSION}/scowl-{SCOWL_VERSION}.tar.gz"
SCOWL_DIR = os.path.join(CACHE, f"scowl-{SCOWL_VERSION}", "final")

ANSWER_COUNT = 1500  # top N candidates by frequency, before rejects
KINDS = ("english-words", "american-words", "british-words")


def ensure_scowl():
    if os.path.isdir(SCOWL_DIR):
        return
    os.makedirs(CACHE, exist_ok=True)
    archive = os.path.join(CACHE, "scowl.tar.gz")
    print("Downloading SCOWL...")
    urllib.request.urlretrieve(SCOWL_URL, archive)
    with tarfile.open(archive) as tar:
        tar.extractall(CACHE)


LENGTHS = (4, 5, 6)


def load(max_level, pattern):
    words = set()
    for kind in KINDS:
        for path in glob.glob(os.path.join(SCOWL_DIR, kind + ".*")):
            if int(path.rsplit(".", 1)[1]) > max_level:
                continue
            with open(path, encoding="latin-1") as f:
                for line in f:
                    w = line.strip()
                    if re.fullmatch(pattern, w):
                        words.add(w)
    return words


def is_plural(word, all_words):
    if not word.endswith("s") or word.endswith("ss"):
        return False
    if word[:-1] in all_words or (word.endswith("es") and word[:-2] in all_words):
        return True
    # cities -> city, knives -> knife. Only for 5+ letters, so the 4-letter list
    # (and with it the published 4-letter puzzles) stays exactly as it was.
    if len(word) >= 5 and word.endswith("ies") and word[:-3] + "y" in all_words:
        return True
    if len(word) >= 5 and word.endswith("ves") and (word[:-3] + "f" in all_words or word[:-3] + "fe" in all_words):
        return True
    return False


def build(n, all_words):
    with open(os.path.join(ROOT, "scripts", "words", str(n), "review.json")) as f:
        review = json.load(f)
    rejects = {w for group in review["reject"].values() for w in group}

    valid = load(70, rf"[a-z]{{{n}}}")
    common = load(50, rf"[a-z]{{{n}}}")

    candidates = [w for w in common if not is_plural(w, all_words)]
    candidates.sort(key=lambda w: (-zipf_frequency(w, "en"), w))
    candidates = candidates[:ANSWER_COUNT]
    answers = [{"word": w, "zipf": round(zipf_frequency(w, "en"), 2)} for w in candidates if w not in rejects]

    os.makedirs(os.path.join(ROOT, "src", "data", str(n)), exist_ok=True)
    with open(os.path.join(ROOT, "src", "data", str(n), "valid-words.json"), "w") as f:
        json.dump(sorted(w.upper() for w in valid), f, separators=(",", ":"))
    with open(os.path.join(ROOT, "scripts", "words", str(n), "answers.json"), "w") as f:
        rows = [json.dumps([a["word"].upper(), a["zipf"]]) for a in answers]
        f.write("[\n" + ",\n".join(rows) + "\n]\n")

    print(f"{n} letters: valid words {len(valid)}, answer words {len(answers)} (rejected {len(candidates) - len(answers)})")


def main():
    ensure_scowl()
    lengths = [int(a) for a in sys.argv[1:]] or LENGTHS
    all_words = load(70, r"[a-z]+")
    for n in lengths:
        build(n, all_words)


if __name__ == "__main__":
    main()
