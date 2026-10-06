# Word Weaver

A daily word puzzle. Four hidden words form a frame: the top and bottom words read left to right, the left and right words read top to bottom, and the four corner letters are given. Place the remaining letters to find all four words. Play with 4, 5 or 6 letter words.

## Playing

- Drag a letter onto a square (works with mouse and touch), or tap a letter and then a square.
- Drag a placed letter onto another square to swap, or off the board to send it back.
- Keyboard: type to fill the highlighted square, Backspace to remove, arrow keys to move, Enter to submit.
- Pick the word length with the **4 · 5 · 6** switch. Bigger boards have more letters to place (8, 12 or 16) and more hints (6, 9 or 12).
- A hint reveals one letter. Scoring is Wordle-style: solve it with as few hints as possible. Time and wrong guesses are shown on the result screen.
- **Daily** gives everyone the same puzzle each day, one per word length, each with its own streak and stats. **Archive** has every past daily (doesn't count for the streak). **Practice** gives random puzzles.
- Share sends a spoiler-free emoji summary plus a link. Whoever opens the link plays the same puzzle and sees your hints and time to beat.
- After the first visit the game works offline and can be added to the home screen.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (game logic, puzzle uniqueness, definitions, stats, share codes)
npm run build      # type check + production build in dist/
npm run test:e2e   # browser tests against the build (desktop and phone)
```

The browser tests use Playwright. Run `npx playwright install chromium` once, or set `CHROMIUM_PATH` to an existing Chromium.

Pushing to `master` runs all tests and deploys `dist/` to GitHub Pages (`.github/workflows/deploy.yml`). For that to work, set **Settings → Pages → Source** to **GitHub Actions**. Pull requests run the same tests without deploying.

### Code layout

| File | What it does |
| --- | --- |
| `src/puzzle.ts` | Board layout for any word length, mapping words to cells, counting solutions |
| `src/state.ts` | Pure game logic: place/swap tiles, hints, submit, pause. No DOM. |
| `src/daily.ts` | Loading each word length's data, which puzzle belongs to which day |
| `src/stats.ts` | Streaks, hint distribution, archive results, saved progress (localStorage) |
| `src/share.ts` | Share text, emoji board, challenge link codes |
| `src/dragdrop.ts` | Taps and drag and drop with Pointer Events (mouse, touch, pen) |
| `src/main.ts` | Rendering and wiring the UI to the state |
| `src/service-worker.js` | Offline support; the build turns it into `sw.js` with the list of files to store |
| `e2e/` | Playwright browser tests |

### Screen size

Everything is sized in `rem`, and the root font size is chosen so the whole game fits the screen (see the top of `src/style.css`). The game's natural size per word length is measured and stored there as `--w0`/`--h0`; if the layout changes, measure again so the game keeps fitting.

## Word lists and puzzles

Puzzles are generated ahead of time, so every puzzle has **exactly one solution**. Each word length has its own files: `scripts/words/<n>/` and `src/data/<n>/`.

1. `scripts/build-wordlists.py` builds, per length:
   - `src/data/<n>/valid-words.json`: a big list (SCOWL size 70). It's used to reject puzzles with a second solution and to say "real words, but not the answer".
   - `scripts/words/<n>/answers.json`: common words only (SCOWL size 50, no plurals), ranked by [wordfreq](https://github.com/rspeer/wordfreq) frequency, minus the words rejected in `scripts/words/<n>/review.json`.
2. `scripts/words/<n>/review.json` holds the triage of answer candidates: offensive words, names, abbreviations, plurals and obscure words are rejected. A `maybe` list has words worth a second look.
3. `scripts/generate-puzzles.mjs` builds 2,200 daily puzzles (6+ years) and 3,000 practice puzzles per length into `src/data/<n>/puzzles.json`. Rules: answer words only, unique solution against the big list, at most one less common word per puzzle, no word repeats within 90 days, easier puzzles early in the week. The script checks all of these rules before it writes anything. The output is the same every time for the same word list.

To change the words:

```bash
python3 -m venv .venv && .venv/bin/pip install wordfreq
# edit scripts/words/<n>/review.json
.venv/bin/python scripts/build-wordlists.py <n>
npm run puzzles -- <n>
npm run definitions
npm test
```

Definitions shown on the result screen come from `src/data/<n>/definitions.json`, built by `npm run definitions` (`scripts/build-definitions.mjs`) from WordNet. Words like ASKED or HAVING are shown via their base form ("past tense of ask: ..."). To fix a definition or add one WordNet doesn't have, edit `scripts/words/definition-overrides.json` and run it again. Run it after `npm run puzzles` too: it fails if a puzzle word has no definition.

Regenerating changes which puzzle belongs to which day, so only do it before a length goes live, or accept that past days change.

## Link previews

`public/preview.jpg` is the image shown when the game's link is shared (WhatsApp, Discord, social media). It's rendered from `scripts/preview-image.html` with `npm run preview-image`. The preview tags in `index.html` point at the GitHub Pages address; update them if the game moves to another address.

Credits: [SCOWL](http://wordlist.aspell.net/) (MIT-like), [wordfreq](https://github.com/rspeer/wordfreq) (Apache-2.0, data CC BY-SA 4.0), definitions from [WordNet 3.1](https://wordnet.princeton.edu/) (© Princeton University, [WordNet license](https://wordnet.princeton.edu/license-and-commercial-use)).
