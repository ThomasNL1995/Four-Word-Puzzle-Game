import "./style.css";

import validWordList from "./data/valid-words.json";
import { dailyPuzzle, msUntilNextPuzzle, practicePuzzles, puzzleNumber } from "./daily.ts";
import { enablePointerInput } from "./dragdrop.ts";
import { CELL_COUNT, CORNERS, EDITABLE, LINES, type Puzzle } from "./puzzle.ts";
import { decodeChallenge, encodeChallenge, formatTime, shareText, type Challenge, type PuzzleRef } from "./share.ts";
import {
  boardLetters,
  cellOfTile,
  clearBoard,
  elapsedMs,
  hintsLeft,
  isEditable,
  isTileLocked,
  moveTile,
  newGame,
  pause,
  resume,
  submit,
  useHint,
  type GameState,
} from "./state.ts";
import {
  liveStreak,
  loadDaily,
  loadPractice,
  loadStats,
  recordDailyStart,
  recordDailyWin,
  saveDaily,
  savePractice,
  saveStats,
} from "./stats.ts";

const validWords = new Set<string>(validWordList);

// ---------- DOM ----------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  board: $("board"),
  tray: $("tray"),
  message: $("message"),
  puzzleLabel: $("puzzle-label"),
  banner: $("challenge-banner"),
  modeDaily: $<HTMLButtonElement>("mode-daily"),
  modePractice: $<HTMLButtonElement>("mode-practice"),
  pauseButton: $<HTMLButtonElement>("pause-button"),
  pauseOverlay: $("pause-overlay"),
  resumeButton: $<HTMLButtonElement>("resume-button"),
  hintButton: $<HTMLButtonElement>("hint-button"),
  clearButton: $<HTMLButtonElement>("clear-button"),
  submitButton: $<HTMLButtonElement>("submit-button"),
  resultDialog: $<HTMLDialogElement>("result-dialog"),
  resultTitle: $("result-title"),
  resultWords: $("result-words"),
  definition: $("definition"),
  resultTime: $("result-time"),
  resultHints: $("result-hints"),
  resultWrong: $("result-wrong"),
  challengeResult: $("challenge-result"),
  nextPuzzle: $("next-puzzle"),
  countdown: $("countdown"),
  shareButton: $<HTMLButtonElement>("share-button"),
  nextButton: $<HTMLButtonElement>("next-button"),
  shareStatus: $("share-status"),
  statsDialog: $<HTMLDialogElement>("stats-dialog"),
  helpDialog: $<HTMLDialogElement>("help-dialog"),
};

// Board cells: 12 cells placed on a 4x4 grid (the middle 4 positions stay empty).
const cellEls: HTMLElement[] = [];
const GRID_POS = [
  [1, 1], [1, 2], [1, 3], [1, 4],
  [2, 1], [2, 4],
  [3, 1], [3, 4],
  [4, 1], [4, 2], [4, 3], [4, 4],
];
for (let cell = 0; cell < CELL_COUNT; cell++) {
  const div = document.createElement("div");
  div.className = "cell";
  div.dataset.cell = String(cell);
  div.setAttribute("role", "gridcell");
  div.style.gridRow = String(GRID_POS[cell][0]);
  div.style.gridColumn = String(GRID_POS[cell][1]);
  el.board.appendChild(div);
  cellEls.push(div);
}

// ---------- App state ----------

type Mode = { kind: "daily"; day: number } | { kind: "practice"; index: number } | { kind: "challenge"; ref: PuzzleRef };

let mode: Mode;
let state: GameState;
let stats = loadStats();
let challenge: Challenge | null = null;
let selectedTile: number | null = null;
let cursor: number | null = null;
let toast = "";
let trayKey = "";

const today = () => puzzleNumber(new Date());

function currentRef(): PuzzleRef {
  if (mode.kind === "daily") return { kind: "daily", number: mode.day };
  if (mode.kind === "practice") return { kind: "practice", index: mode.index };
  return mode.ref;
}

function puzzleFor(ref: PuzzleRef): Puzzle {
  return ref.kind === "daily" ? dailyPuzzle(ref.number) : practicePuzzles[ref.index];
}

function refTitle(ref: PuzzleRef): string {
  return ref.kind === "daily" ? `Word Weaver #${ref.number}` : `Word Weaver Practice #${ref.index + 1}`;
}

/**
 * Saved states store the clock as stopped. Coming back to an unfinished game continues it
 * (it was most likely paused automatically when the tab was hidden).
 */
function restore(saved: GameState): GameState {
  if (saved.status === "won") return { ...saved, resumedAt: null };
  return { ...saved, status: "playing", resumedAt: Date.now() };
}

function snapshot(s: GameState): GameState {
  return { ...s, elapsedMs: elapsedMs(s, Date.now()), resumedAt: null };
}

function persist() {
  if (mode.kind === "daily") saveDaily({ day: mode.day, state: snapshot(state) });
  else if (mode.kind === "practice") savePractice({ index: mode.index, state: snapshot(state) });
}

// ---------- Starting games ----------

function startGame(nextMode: Mode, nextState: GameState) {
  mode = nextMode;
  state = nextState;
  selectedTile = null;
  cursor = firstEmptyCell();
  toast = "";
  closeDialogs();
  persist();
  render();
  if (state.status === "won") showResult();
}

function startDaily() {
  const day = today();
  const saved = loadDaily();
  const game = saved?.day === day ? restore(saved.state) : newGame(dailyPuzzle(day), Date.now());
  stats = recordDailyStart(stats, day);
  saveStats(stats);
  startGame({ kind: "daily", day }, game);
}

function startPractice(forceNew = false) {
  const saved = loadPractice();
  if (!forceNew && saved && saved.state.status !== "won") {
    startGame({ kind: "practice", index: saved.index }, restore(saved.state));
    return;
  }
  let index = Math.floor(Math.random() * practicePuzzles.length);
  if (saved && index === saved.index) index = (index + 1) % practicePuzzles.length;
  startGame({ kind: "practice", index }, newGame(practicePuzzles[index], Date.now()));
}

function startChallenge(ref: PuzzleRef) {
  startGame({ kind: "challenge", ref }, newGame(puzzleFor(ref), Date.now()));
}

function leaveChallenge() {
  challenge = null;
  const url = new URL(location.href);
  if (url.searchParams.has("c")) {
    url.searchParams.delete("c");
    history.replaceState(null, "", url);
  }
}

// ---------- Updating ----------

function setState(next: GameState) {
  if (next === state) return;
  const justWon = state.status !== "won" && next.status === "won";
  state = next;
  toast = "";
  if (justWon) recordWin();
  persist();
  render();
  if (justWon) setTimeout(showResult, 700);
}

function recordWin() {
  const seconds = Math.round(state.elapsedMs / 1000);
  if (mode.kind === "daily") stats = recordDailyWin(stats, mode.day, state.hintsUsed, seconds);
  else if (mode.kind === "practice") stats = { ...stats, practiceSolved: stats.practiceSolved + 1 };
  saveStats(stats);
  selectedTile = null;
  cursor = null;
}

function firstEmptyCell(from = -1): number | null {
  const editable = EDITABLE.filter((cell) => isEditable(state, cell));
  if (editable.length === 0) return null;
  const start = editable.findIndex((cell) => cell > from);
  const ordered = start === -1 ? editable : [...editable.slice(start), ...editable.slice(0, start)];
  return ordered.find((cell) => state.cells[cell] === null) ?? null;
}

// ---------- Rendering ----------

function feedbackText(): string {
  if (toast) return toast;
  const f = state.feedback;
  if (!f) return "";
  switch (f.kind) {
    case "incomplete":
      return "Fill in all the squares first.";
    case "real-words":
      return "Those are real words, but not the ones we're looking for!";
    case "wrong":
      return f.correctLines.length > 0
        ? `Not quite. ${f.correctLines.length} of 4 words ${f.correctLines.length === 1 ? "is" : "are"} right.`
        : "Not quite, try again!";
    case "won":
      return "Solved!";
  }
}

function render() {
  const letters = boardLetters(state);
  const playing = state.status === "playing";
  const correctCells = new Set<number>();
  if (state.feedback && "correctLines" in state.feedback) {
    for (const line of state.feedback.correctLines) LINES[line].forEach((c) => correctCells.add(c));
  }

  cellEls.forEach((div, cell) => {
    const tile = state.cells[cell];
    const corner = CORNERS.includes(cell);
    const hinted = state.hinted.includes(cell);
    div.textContent = letters[cell];
    div.classList.toggle("corner", corner);
    div.classList.toggle("hinted", hinted);
    div.classList.toggle("filled", tile !== null);
    div.classList.toggle("editable", isEditable(state, cell));
    div.classList.toggle("cursor", playing && cell === cursor);
    div.classList.toggle("correct", correctCells.has(cell));
    if (tile !== null && !hinted && playing) div.dataset.tile = String(tile);
    else delete div.dataset.tile;
    div.setAttribute("aria-label", `${letters[cell] || "empty"}${corner ? ", given" : hinted ? ", hint" : ""}`);
  });
  el.board.classList.toggle("has-selection", selectedTile !== null);
  el.board.classList.toggle("solved", state.status === "won");

  renderTray();

  el.message.textContent = feedbackText();
  el.hintButton.textContent = `Hint (${hintsLeft(state)})`;
  el.hintButton.disabled = !playing || hintsLeft(state) <= 0;
  el.clearButton.disabled = !playing;
  el.submitButton.disabled = !playing;
  el.pauseButton.hidden = state.status === "won";
  el.pauseButton.textContent = state.status === "paused" ? "Resume" : "Pause";
  el.pauseOverlay.hidden = state.status !== "paused";

  const ref = currentRef();
  el.puzzleLabel.textContent =
    (mode.kind === "challenge" ? "Challenge: " : "") + (ref.kind === "daily" ? `#${ref.number}` : `Practice #${ref.index + 1}`);
  el.modeDaily.setAttribute("aria-pressed", String(mode.kind === "daily"));
  el.modePractice.setAttribute("aria-pressed", String(mode.kind === "practice"));

  el.banner.hidden = !challenge;
  if (challenge) {
    const hints = challenge.hints === 1 ? "1 hint" : `${challenge.hints} hints`;
    el.banner.textContent = `A friend solved this puzzle with ${hints} in ${formatTime(challenge.seconds)}. Can you beat that?`;
  }
}

function renderTray() {
  const key = state.puzzle.join(",") + state.tiles.join("");
  if (key !== trayKey) {
    trayKey = key;
    el.tray.replaceChildren(
      ...state.tiles.map((letter, tile) => {
        const slot = document.createElement("div");
        slot.className = "slot";
        const div = document.createElement("div");
        div.className = "tile";
        div.dataset.tile = String(tile);
        div.textContent = letter;
        div.setAttribute("role", "button");
        div.setAttribute("aria-label", `Letter ${letter}`);
        slot.appendChild(div);
        return slot;
      })
    );
  }
  el.tray.querySelectorAll<HTMLElement>(".tile").forEach((div) => {
    const tile = Number(div.dataset.tile);
    div.hidden = cellOfTile(state, tile) !== -1;
    div.classList.toggle("selected", tile === selectedTile);
  });
}

function flash(text: string) {
  toast = text;
  el.message.textContent = text;
}

function shake() {
  el.board.classList.remove("shake");
  void el.board.offsetWidth; // restart the animation
  el.board.classList.add("shake");
}

// ---------- Result dialog ----------

let countdownTimer: number | undefined;

function closeDialogs() {
  document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((d) => d.close());
}

function showResult() {
  if (state.status !== "won") return;
  const ref = currentRef();
  const seconds = Math.round(state.elapsedMs / 1000);
  el.resultTitle.textContent = ref.kind === "daily" ? `Solved #${ref.number}!` : "Solved!";
  el.resultTime.textContent = formatTime(seconds);
  el.resultHints.textContent = String(state.hintsUsed);
  el.resultWrong.textContent = String(state.wrongSubmits);
  el.definition.textContent = "";
  el.shareStatus.textContent = "";

  el.resultWords.replaceChildren(
    ...state.puzzle.map((word) => {
      const button = document.createElement("button");
      button.className = "result-word";
      button.textContent = word;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        el.resultWords.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        showDefinition(word);
      });
      return button;
    })
  );

  el.challengeResult.hidden = !challenge;
  if (challenge) {
    const better = state.hintsUsed < challenge.hints || (state.hintsUsed === challenge.hints && seconds < challenge.seconds);
    const tie = state.hintsUsed === challenge.hints && seconds === challenge.seconds;
    el.challengeResult.textContent = tie
      ? "It's a tie with your friend!"
      : better
        ? "You beat your friend! 🎉"
        : `Your friend wins this one (${challenge.hints} hints, ${formatTime(challenge.seconds)}).`;
  }

  el.nextPuzzle.hidden = mode.kind !== "daily";
  el.nextButton.textContent = mode.kind === "practice" ? "Next puzzle" : mode.kind === "daily" ? "Practice" : "Today's puzzle";
  clearInterval(countdownTimer);
  if (mode.kind === "daily") {
    const tick = () => {
      const ms = msUntilNextPuzzle(new Date());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      el.countdown.textContent = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };
    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }

  if (!el.resultDialog.open) el.resultDialog.showModal();
}

type Definition = { pos: string; text: string };
let definitions: Promise<Record<string, Definition>> | null = null;

async function showDefinition(word: string) {
  // Bundled with the game (from WordNet), loaded on first use as a separate chunk.
  definitions ??= import("./data/definitions.json").then((m) => m.default as Record<string, Definition>);
  try {
    const def = (await definitions)[word];
    el.definition.textContent = def ? `${word} (${def.pos}): ${def.text}` : `${word}: no definition available.`;
  } catch {
    definitions = null; // e.g. the chunk failed to load while offline; try again next tap
    el.definition.textContent = "Couldn't load the definition. Check your connection and try again.";
  }
}

async function share() {
  const ref = currentRef();
  const seconds = Math.round(state.elapsedMs / 1000);
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("c", encodeChallenge({ ref, hints: state.hintsUsed, seconds }));
  const text = shareText({
    title: refTitle(ref),
    hinted: state.hinted,
    hints: state.hintsUsed,
    wrongSubmits: state.wrongSubmits,
    seconds,
    url: url.toString(),
  });

  const touchDevice = matchMedia("(pointer: coarse)").matches;
  if (touchDevice && navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    el.shareStatus.textContent = "Copied to clipboard!";
  } catch {
    el.shareStatus.textContent = text;
  }
}

function showStats() {
  const day = today();
  $("stat-played").textContent = String(stats.played);
  $("stat-solved").textContent = stats.played ? String(Math.round((stats.solved / stats.played) * 100)) : "0";
  $("stat-streak").textContent = String(liveStreak(stats, day));
  $("stat-max-streak").textContent = String(stats.maxStreak);

  const max = Math.max(1, ...stats.hintDistribution);
  const solvedToday = stats.lastSolvedDay === day ? loadDaily()?.state.hintsUsed : undefined;
  $("distribution").replaceChildren(
    ...stats.hintDistribution.map((count, hints) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      const label = document.createElement("span");
      label.className = "bar-label";
      label.textContent = String(hints);
      const bar = document.createElement("span");
      bar.className = "bar" + (hints === solvedToday ? " today" : "");
      bar.style.width = `${Math.max(8, (count / max) * 100)}%`;
      bar.textContent = String(count);
      row.append(label, bar);
      return row;
    })
  );
  const extra = [];
  if (stats.bestSeconds !== null) extra.push(`Fastest daily: ${formatTime(stats.bestSeconds)}`);
  if (stats.practiceSolved) extra.push(`Practice puzzles solved: ${stats.practiceSolved}`);
  $("stat-extra").textContent = extra.join(" · ");
  el.statsDialog.showModal();
}

// ---------- Input: taps and drag and drop ----------

function tapCell(cell: number) {
  if (state.status !== "playing" || !isEditable(state, cell)) return;
  cursor = cell;
  if (selectedTile !== null) {
    const tile = selectedTile;
    selectedTile = null;
    setState(moveTile(state, tile, cell));
  } else if (state.cells[cell] !== null) {
    setState(moveTile(state, state.cells[cell]!, null));
  }
  render();
}

function tapTile(tile: number) {
  if (state.status !== "playing") return;
  selectedTile = selectedTile === tile ? null : tile;
  render();
}

let dropTarget: HTMLElement | null = null;

enablePointerInput({
  selector: "[data-cell], .tile",
  canDrag: (tile) => state.status === "playing" && !isTileLocked(state, tile),
  onTap(target) {
    if (target.dataset.cell !== undefined) tapCell(Number(target.dataset.cell));
    else tapTile(Number(target.dataset.tile));
  },
  onDragOver(target) {
    const cell = target?.closest<HTMLElement>("[data-cell]") ?? null;
    const next = cell && isEditable(state, Number(cell.dataset.cell)) ? cell : null;
    if (next === dropTarget) return;
    dropTarget?.classList.remove("drop-target");
    next?.classList.add("drop-target");
    dropTarget = next;
  },
  onDrop(tile, target) {
    selectedTile = null;
    const cell = target?.closest<HTMLElement>("[data-cell]");
    if (cell) {
      const index = Number(cell.dataset.cell);
      if (isEditable(state, index)) cursor = index;
      setState(moveTile(state, tile, index));
    } else {
      // Dropped on the tray or anywhere else: back to the tray.
      setState(moveTile(state, tile, null));
    }
    render();
  },
});

// ---------- Input: keyboard ----------

// Grid positions, used to move the cursor with the arrow keys.
const POS = GRID_POS.map(([r, c]) => [r - 1, c - 1]);
const cellAt = (r: number, c: number) => POS.findIndex(([pr, pc]) => pr === r && pc === c);

function moveCursor(dr: number, dc: number) {
  if (cursor === null) {
    cursor = firstEmptyCell() ?? EDITABLE.find((c) => isEditable(state, c)) ?? null;
    return;
  }
  let [r, c] = POS[cursor];
  for (;;) {
    r += dr;
    c += dc;
    if (r < 0 || r > 3 || c < 0 || c > 3) return;
    const cell = cellAt(r, c);
    if (cell !== -1 && isEditable(state, cell)) {
      cursor = cell;
      return;
    }
  }
}

function typeLetter(letter: string) {
  if (cursor === null || !isEditable(state, cursor)) cursor = firstEmptyCell();
  if (cursor === null) return;
  const tile = state.tiles.findIndex((l, t) => l === letter && cellOfTile(state, t) === -1);
  if (tile === -1) {
    flash(`No ${letter} left in your letters.`);
    return;
  }
  const at = cursor;
  setState(moveTile(state, tile, at));
  cursor = firstEmptyCell(at) ?? at;
  render();
}

function backspace() {
  if (cursor === null) return;
  if (state.cells[cursor] === null || !isEditable(state, cursor)) {
    const editable = EDITABLE.filter((c) => isEditable(state, c));
    const before = editable.filter((c) => c < cursor!);
    cursor = before.length ? before[before.length - 1] : cursor;
  }
  const tile = state.cells[cursor];
  if (tile !== null && isEditable(state, cursor)) setState(moveTile(state, tile, null));
  render();
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
  if (state.status !== "playing") return;
  const key = e.key;
  if (/^[a-zA-Z]$/.test(key)) typeLetter(key.toUpperCase());
  else if (key === "Backspace" || key === "Delete") backspace();
  else if (key === "Enter") setState(submit(state, validWords, Date.now()));
  else if (key === "ArrowLeft") moveCursor(0, -1);
  else if (key === "ArrowRight") moveCursor(0, 1);
  else if (key === "ArrowUp") moveCursor(-1, 0);
  else if (key === "ArrowDown") moveCursor(1, 0);
  else if (key === "Escape") selectedTile = null;
  else return;
  e.preventDefault();
  render();
});

// ---------- Buttons ----------

el.hintButton.addEventListener("click", () => {
  setState(useHint(state, Date.now()));
  // The hint may have landed on the highlighted square: move on to the next free one.
  if (cursor !== null && !isEditable(state, cursor)) cursor = firstEmptyCell(cursor);
  // The hint may also have used the picked-up tile.
  if (selectedTile !== null && cellOfTile(state, selectedTile) !== -1) selectedTile = null;
  render();
});
el.clearButton.addEventListener("click", () => {
  setState(clearBoard(state));
  cursor = firstEmptyCell();
  render();
});
el.submitButton.addEventListener("click", () => {
  const next = submit(state, validWords, Date.now());
  setState(next);
  if (next.feedback?.kind === "wrong" || next.feedback?.kind === "real-words") shake();
});
el.pauseButton.addEventListener("click", () =>
  setState(state.status === "paused" ? resume(state, Date.now()) : pause(state, Date.now()))
);
el.resumeButton.addEventListener("click", () => setState(resume(state, Date.now())));

el.modeDaily.addEventListener("click", () => {
  leaveChallenge();
  startDaily();
});
el.modePractice.addEventListener("click", () => {
  leaveChallenge();
  startPractice();
});

el.shareButton.addEventListener("click", share);
el.nextButton.addEventListener("click", () => {
  const wasChallenge = mode.kind === "challenge";
  leaveChallenge();
  if (mode.kind === "daily") startPractice();
  else if (wasChallenge) startDaily();
  else startPractice(true);
});

$("stats-button").addEventListener("click", showStats);
$("help-button").addEventListener("click", () => el.helpDialog.showModal());

document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
  dialog.querySelector("[data-close]")?.addEventListener("click", () => dialog.close());
  // Click on the backdrop closes the dialog.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
});
el.resultDialog.addEventListener("close", () => clearInterval(countdownTimer));

// Don't let the clock run while the tab is hidden.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.status === "playing") setState(pause(state, Date.now()));
});
window.addEventListener("pagehide", persist);

// ---------- Boot ----------

function boot() {
  const code = new URLSearchParams(location.search).get("c");
  const decoded = code ? decodeChallenge(code) : null;
  const valid =
    decoded &&
    (decoded.ref.kind === "daily"
      ? decoded.ref.number >= 1 && decoded.ref.number <= today()
      : decoded.ref.index >= 0 && decoded.ref.index < practicePuzzles.length);

  if (!decoded || !valid) {
    if (code) leaveChallenge();
    startDaily();
    return;
  }
  challenge = decoded;
  // Today's daily stays a normal daily (so it counts for your streak), with the friend's score shown.
  if (decoded.ref.kind === "daily" && decoded.ref.number === today()) startDaily();
  else startChallenge(decoded.ref);
}

boot();

// First visit: explain the game.
try {
  if (!localStorage.getItem("word-weaver:seen-help")) {
    localStorage.setItem("word-weaver:seen-help", "1");
    el.helpDialog.showModal();
  }
} catch {
  // No storage: skip the automatic help.
}
