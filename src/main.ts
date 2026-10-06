import "./style.css";

import {
  dailyPuzzle,
  loadDefinitions,
  loadPuzzleSet,
  msUntilNextPuzzle,
  puzzleDate,
  puzzleNumber,
  type PuzzleSet,
} from "./daily.ts";
import { enablePointerInput } from "./dragdrop.ts";
import { layout, SIZES } from "./puzzle.ts";
import { decodeChallenge, encodeChallenge, formatTime, shareText, type Challenge, type PuzzleRef } from "./share.ts";
import {
  boardLayout,
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
  loadGame,
  loadResults,
  loadSetting,
  loadStats,
  recordDailyStart,
  recordDailyWin,
  recordResult,
  saveGame,
  saveResults,
  saveSetting,
  saveStats,
  type Results,
  type Stats,
} from "./stats.ts";

// ---------- DOM ----------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  board: $("board"),
  tray: $("tray"),
  message: $("message"),
  puzzleLabel: $("puzzle-label"),
  banner: $("challenge-banner"),
  modeDaily: $<HTMLButtonElement>("mode-daily"),
  modeArchive: $<HTMLButtonElement>("mode-archive"),
  modePractice: $<HTMLButtonElement>("mode-practice"),
  sizeButtons: [...document.querySelectorAll<HTMLButtonElement>("[data-size-choice]")],
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
  statsTitle: $("stats-title"),
  helpDialog: $<HTMLDialogElement>("help-dialog"),
  archiveDialog: $<HTMLDialogElement>("archive-dialog"),
  archiveTitle: $("archive-title"),
  archiveList: $("archive-list"),
  archiveEmpty: $("archive-empty"),
};

// ---------- App state ----------

type Mode = "daily" | "archive" | "practice";

let size = Number(loadSetting("size")) || 4;
if (!SIZES.includes(size as (typeof SIZES)[number])) size = 4;
let set: PuzzleSet;
let mode: Mode = "daily";
/** Day number (daily, archive) or puzzle index (practice). */
let gameId = 0;
let state: GameState;
let stats: Stats;
let results: Results;
let challenge: Challenge | null = null;
let selectedTile: number | null = null;
let cursor: number | null = null;
let toast = "";
let trayKey = "";
let boardSize = 0;
let cellEls: HTMLElement[] = [];
/** Increases with every game start, so a slow data load can't start an outdated game. */
let startToken = 0;

const today = () => puzzleNumber(new Date());

function currentRef(): PuzzleRef {
  return mode === "practice" ? { kind: "practice", size, index: gameId } : { kind: "daily", size, number: gameId };
}

function sizeSuffix(n: number) {
  return n === 4 ? "" : ` · ${n} letters`;
}

function refTitle(ref: PuzzleRef): string {
  const name = ref.kind === "daily" ? `Word Weaver #${ref.number}` : `Word Weaver Practice #${ref.index + 1}`;
  return name + sizeSuffix(ref.size);
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
  if (state) saveGame(mode, size, { id: gameId, state: snapshot(state) });
}

// ---------- Board ----------

function buildBoard() {
  if (boardSize === size) return;
  boardSize = size;
  const { cellCount, positions } = layout(size);
  document.documentElement.dataset.size = String(size);
  el.board.style.setProperty("--n", String(size));
  cellEls = Array.from({ length: cellCount }, (_, cell) => {
    const div = document.createElement("div");
    div.className = "cell";
    div.dataset.cell = String(cell);
    div.setAttribute("role", "gridcell");
    div.style.gridRow = String(positions[cell][0] + 1);
    div.style.gridColumn = String(positions[cell][1] + 1);
    return div;
  });
  el.board.replaceChildren(...cellEls);
  trayKey = "";
}

// ---------- Starting games ----------

async function useSize(n: number): Promise<boolean> {
  const token = ++startToken;
  const loaded = await loadPuzzleSet(n);
  if (token !== startToken) return false;
  size = n;
  set = loaded;
  stats = loadStats(size);
  results = loadResults(size);
  saveSetting("size", String(size));
  buildBoard();
  return true;
}

function startGame(nextMode: Mode, id: number, nextState: GameState) {
  mode = nextMode;
  gameId = id;
  state = nextState;
  selectedTile = null;
  cursor = firstEmptyCell();
  toast = "";
  closeDialogs();
  persist();
  render();
  if (state.status === "won") showResult();
}

async function startDaily(n = size) {
  if (!(await useSize(n))) return;
  const day = today();
  const saved = loadGame("daily", size);
  const game = saved?.id === day ? restore(saved.state) : newGame(dailyPuzzle(set, day), Date.now());
  stats = recordDailyStart(stats, day);
  saveStats(size, stats);
  startGame("daily", day, game);
}

async function startArchive(day: number, n = size) {
  if (!(await useSize(n))) return;
  const saved = loadGame("archive", size);
  const game = saved?.id === day ? restore(saved.state) : newGame(dailyPuzzle(set, day), Date.now());
  startGame("archive", day, game);
}

async function startPractice(n = size, options: { forceNew?: boolean; index?: number } = {}) {
  if (!(await useSize(n))) return;
  const saved = loadGame("practice", size);
  if (options.index !== undefined) {
    const game = saved?.id === options.index ? restore(saved.state) : newGame(set.practice[options.index], Date.now());
    startGame("practice", options.index, game);
    return;
  }
  if (!options.forceNew && saved && saved.state.status !== "won") {
    startGame("practice", saved.id, restore(saved.state));
    return;
  }
  let index = Math.floor(Math.random() * set.practice.length);
  if (saved && index === saved.id) index = (index + 1) % set.practice.length;
  startGame("practice", index, newGame(set.practice[index], Date.now()));
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
  const result = { hints: state.hintsUsed, wrong: state.wrongSubmits, seconds };
  if (mode === "daily") {
    stats = recordDailyWin(stats, gameId, state.hintsUsed, seconds);
    results = recordResult(results, gameId, result);
  } else if (mode === "archive") {
    results = recordResult(results, gameId, result);
  } else {
    stats = { ...stats, practiceSolved: stats.practiceSolved + 1 };
  }
  saveStats(size, stats);
  saveResults(size, results);
  selectedTile = null;
  cursor = null;
}

function firstEmptyCell(from = -1): number | null {
  const editable = boardLayout(state).editable.filter((cell) => isEditable(state, cell));
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
  const { corners, lines } = boardLayout(state);
  const playing = state.status === "playing";
  const correctCells = new Set<number>();
  if (state.feedback && "correctLines" in state.feedback) {
    for (const line of state.feedback.correctLines) lines[line].forEach((c) => correctCells.add(c));
  }

  cellEls.forEach((div, cell) => {
    const tile = state.cells[cell];
    const corner = corners.includes(cell);
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

  el.puzzleLabel.textContent =
    mode === "practice" ? `Practice #${gameId + 1}` : mode === "archive" ? `#${gameId} · ${shortDate(gameId)}` : `#${gameId}`;
  el.modeDaily.setAttribute("aria-pressed", String(mode === "daily"));
  el.modeArchive.setAttribute("aria-pressed", String(mode === "archive"));
  el.modePractice.setAttribute("aria-pressed", String(mode === "practice"));
  el.sizeButtons.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.sizeChoice) === size)));

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

function shortDate(day: number) {
  return puzzleDate(day).toLocaleDateString(undefined, { day: "numeric", month: "short" });
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
  const seconds = Math.round(state.elapsedMs / 1000);
  el.resultTitle.textContent = mode === "practice" ? "Solved!" : `Solved #${gameId}!`;
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

  el.nextPuzzle.hidden = mode !== "daily";
  el.nextButton.textContent = mode === "practice" ? "Next puzzle" : mode === "archive" ? "More puzzles" : "Practice";
  clearInterval(countdownTimer);
  if (mode === "daily") {
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

async function showDefinition(word: string) {
  try {
    const def = (await loadDefinitions(word.length))[word];
    el.definition.textContent = def ? `${word} (${def.pos}): ${def.text}` : `${word}: no definition available.`;
  } catch {
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
    size,
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

// ---------- Stats and archive dialogs ----------

function showStats() {
  const day = today();
  el.statsTitle.textContent = `Statistics${sizeSuffix(size)}`;
  $("stat-played").textContent = String(stats.played);
  $("stat-solved").textContent = stats.played ? String(Math.round((stats.solved / stats.played) * 100)) : "0";
  $("stat-streak").textContent = String(liveStreak(stats, day));
  $("stat-max-streak").textContent = String(stats.maxStreak);

  const max = Math.max(1, ...stats.hintDistribution);
  const solvedToday = stats.lastSolvedDay === day ? results[day]?.hints : undefined;
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
  const archiveSolved = Object.keys(results).filter((d) => Number(d) < day).length;
  const extra = [];
  if (stats.bestSeconds !== null) extra.push(`Fastest daily: ${formatTime(stats.bestSeconds)}`);
  if (archiveSolved) extra.push(`Past puzzles solved: ${archiveSolved}`);
  if (stats.practiceSolved) extra.push(`Practice puzzles solved: ${stats.practiceSolved}`);
  $("stat-extra").textContent = extra.join(" · ");
  el.statsDialog.showModal();
}

function showArchive() {
  const last = today() - 1;
  const inProgress = loadGame("archive", size);
  el.archiveTitle.textContent = `Archive${sizeSuffix(size)}`;
  el.archiveEmpty.hidden = last >= 1;
  el.archiveList.replaceChildren(
    ...Array.from({ length: Math.max(0, last) }, (_, i) => {
      const day = last - i;
      const result = results[day];
      const started = !result && inProgress?.id === day && inProgress.state.status !== "won";
      const button = document.createElement("button");
      button.className = "archive-day" + (result ? " solved" : started ? " started" : "");
      const status = result
        ? `${result.hints === 0 ? "No hints" : result.hints === 1 ? "1 hint" : `${result.hints} hints`}`
        : started
          ? "In progress"
          : "Not played";
      button.innerHTML = `<span class="archive-number">#${day}</span><span class="archive-date">${shortDate(day)}</span><span class="archive-status">${status}</span>`;
      button.setAttribute("aria-label", `Puzzle ${day}, ${shortDate(day)}, ${status}`);
      button.addEventListener("click", () => {
        leaveChallenge();
        startArchive(day);
      });
      return button;
    })
  );
  el.archiveDialog.showModal();
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

function moveCursor(dr: number, dc: number) {
  const { editable, positions } = boardLayout(state);
  if (cursor === null) {
    cursor = firstEmptyCell() ?? editable.find((c) => isEditable(state, c)) ?? null;
    return;
  }
  let [r, c] = positions[cursor];
  for (;;) {
    r += dr;
    c += dc;
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    const cell = positions.findIndex(([pr, pc]) => pr === r && pc === c);
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
    const editable = boardLayout(state).editable.filter((c) => isEditable(state, c));
    const before = editable.filter((c) => c < cursor!);
    cursor = before.length ? before[before.length - 1] : cursor;
  }
  const tile = state.cells[cursor];
  if (tile !== null && isEditable(state, cursor)) setState(moveTile(state, tile, null));
  render();
}

document.addEventListener("keydown", (e) => {
  if (!state || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
  if (state.status !== "playing") return;
  const key = e.key;
  if (/^[a-zA-Z]$/.test(key)) typeLetter(key.toUpperCase());
  else if (key === "Backspace" || key === "Delete") backspace();
  else if (key === "Enter") setState(submit(state, set.valid, Date.now()));
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
  const next = submit(state, set.valid, Date.now());
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
el.modeArchive.addEventListener("click", showArchive);
el.modePractice.addEventListener("click", () => {
  leaveChallenge();
  startPractice();
});
el.sizeButtons.forEach((button) =>
  button.addEventListener("click", () => {
    const n = Number(button.dataset.sizeChoice);
    if (n === size) return;
    leaveChallenge();
    if (mode === "practice") startPractice(n);
    else startDaily(n);
  })
);

el.shareButton.addEventListener("click", share);
el.nextButton.addEventListener("click", () => {
  leaveChallenge();
  if (mode === "daily") startPractice();
  else if (mode === "archive") {
    el.resultDialog.close();
    showArchive();
  }
  else startPractice(size, { forceNew: true });
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
  if (document.hidden && state?.status === "playing") setState(pause(state, Date.now()));
});
window.addEventListener("pagehide", persist);

// ---------- Boot ----------

async function boot() {
  const code = new URLSearchParams(location.search).get("c");
  const decoded = code ? decodeChallenge(code) : null;
  if (decoded && SIZES.includes(decoded.ref.size as (typeof SIZES)[number])) {
    const { ref } = decoded;
    const loaded = await loadPuzzleSet(ref.size);
    const valid = ref.kind === "daily" ? ref.number >= 1 && ref.number <= today() : ref.index >= 0 && ref.index < loaded.practice.length;
    if (valid) {
      challenge = decoded;
      // Today's daily stays a normal daily (so it counts for your streak), with the friend's score shown.
      if (ref.kind === "practice") return startPractice(ref.size, { index: ref.index });
      if (ref.number === today()) return startDaily(ref.size);
      return startArchive(ref.number, ref.size);
    }
  }
  if (code) leaveChallenge();
  return startDaily();
}

boot();

// First visit: explain the game.
if (!loadSetting("seen-help")) {
  saveSetting("seen-help", "1");
  el.helpDialog.showModal();
}
