"""Build the two word lists used by the game.

  valid-words.json   Big, permissive list (SCOWL size <= 70). Used to reject puzzles
                     with a second solution and to recognise "real word, wrong answer".
  answer-words.json  Small, friendly list: common SCOWL words (size <= 50), no simple
                     plurals, ranked by wordfreq Zipf frequency, minus word-review.json rejects.

Usage (from repo root):
  python3 -m venv .venv && .venv/bin/pip install wordfreq
  .venv/bin/python scripts/build-wordlists.py

SCOWL: http://wordlist.aspell.net (MIT-like license)
wordfreq: https://github.com/rspeer/wordfreq (Apache-2.0, data CC BY-SA 4.0)
"""

import glob
import json
import os
import re
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


def load(max_level, pattern=r"[a-z]{4}"):
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
    return word[:-1] in all_words or (word.endswith("es") and word[:-2] in all_words)


def main():
    ensure_scowl()
    with open(os.path.join(ROOT, "scripts", "word-review.json")) as f:
        review = json.load(f)
    rejects = {w for group in review["reject"].values() for w in group}

    valid = load(70)
    common = load(50)
    all_words = load(70, r"[a-z]+")

    candidates = [w for w in common if not is_plural(w, all_words)]
    candidates.sort(key=lambda w: (-zipf_frequency(w, "en"), w))
    candidates = candidates[:ANSWER_COUNT]
    answers = [{"word": w, "zipf": round(zipf_frequency(w, "en"), 2)} for w in candidates if w not in rejects]

    with open(os.path.join(ROOT, "src", "data", "valid-words.json"), "w") as f:
        json.dump(sorted(w.upper() for w in valid), f, separators=(",", ":"))
    with open(os.path.join(ROOT, "scripts", "answer-words.json"), "w") as f:
        rows = [json.dumps([a["word"].upper(), a["zipf"]]) for a in answers]
        f.write("[\n" + ",\n".join(rows) + "\n]\n")

    print(f"valid words: {len(valid)}, answer words: {len(answers)} (rejected {len(candidates) - len(answers)})")


if __name__ == "__main__":
    main()
