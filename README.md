# Word Weaver

A daily four-word puzzle. The top and bottom words read left to right, the left and right words read top to bottom, and the four corner letters are given. Place the eight remaining letters to find all four words.

## Playing

- Drag a letter onto a square (works with mouse and touch), or tap a letter and then a square.
- Drag a placed letter onto another square to swap, or off the board to send it back.
- Keyboard: type to fill the highlighted square, Backspace to remove, arrow keys to move, Enter to submit.
- A hint reveals one letter (max 6). Scoring is Wordle-style: solve it with as few hints as possible. Time and wrong guesses are shown on the result screen.
- **Daily** gives everyone the same puzzle each day (streaks, stats, hint distribution). **Practice** gives random puzzles that don't count toward the streak.
- Share sends a spoiler-free emoji summary plus a link. Whoever opens the link plays the same puzzle and sees your hints and time to beat.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (game logic, puzzle uniqueness, stats, share codes)
npm run build      # type check + production build in dist/
```

Pushing to `master` runs the tests and deploys `dist/` to GitHub Pages (`.github/workflows/deploy.yml`). For that to work, set **Settings → Pages → Source** to **GitHub Actions**.

### Code layout

| File | What it does |
| --- | --- |
| `src/puzzle.ts` | Board layout, mapping words to cells, counting solutions |
| `src/state.ts` | Pure game logic: place/swap tiles, hints, submit, pause. No DOM. |
| `src/daily.ts` | Which puzzle belongs to which day |
| `src/stats.ts` | Streaks, hint distribution, saved progress (localStorage) |
| `src/share.ts` | Share text, emoji board, challenge link codes |
| `src/dragdrop.ts` | Taps and drag and drop with Pointer Events (mouse, touch, pen) |
| `src/main.ts` | Rendering and wiring the UI to the state |

## Word lists and puzzles

Puzzles are generated ahead of time, so every puzzle has **exactly one solution**.

1. `scripts/build-wordlists.py` builds two lists:
   - `src/data/valid-words.json`: a big list (SCOWL size 70). It's used to reject puzzles with a second solution and to say "real words, but not the answer".
   - `scripts/answer-words.json`: common words only (SCOWL size 50, no plurals), ranked by [wordfreq](https://github.com/rspeer/wordfreq) frequency, minus the words rejected in `scripts/word-review.json`.
2. `scripts/word-review.json` holds the triage of answer candidates: offensive words, names, abbreviations, interjections and archaic words are rejected. A `maybe` list has words worth a second look.
3. `scripts/generate-puzzles.mjs` builds 2,200 daily puzzles (6+ years) and 3,000 practice puzzles into `src/data/puzzles.json`. Rules: answer words only, unique solution against the big list, at most one less common word per puzzle, no word repeats within 90 days, easier puzzles early in the week. The script checks all of these rules before it writes anything.

To change the words:

```bash
python3 -m venv .venv && .venv/bin/pip install wordfreq
# edit scripts/word-review.json
.venv/bin/python scripts/build-wordlists.py
npm run puzzles
npm test
```

Regenerating changes which puzzle belongs to which day, so do it before launch or only for days that haven't happened yet.

Credits: [SCOWL](http://wordlist.aspell.net/) (MIT-like), [wordfreq](https://github.com/rspeer/wordfreq) (Apache-2.0, data CC BY-SA 4.0), definitions from the [Free Dictionary API](https://dictionaryapi.dev/).
