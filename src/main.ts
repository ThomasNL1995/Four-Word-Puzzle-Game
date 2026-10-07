import "./style.css";

import {
  dailyPuzzle,
  loadDefinitions,
  loadPuzzleSet,
  msUntilNextPuzzle,
  puzzleDate,
  puzzleNumber,
  type Definition,
  type PuzzleSet,
} from "./daily.ts";
import { enablePointerInput } from "./dragdrop.ts";
import { layout, LINE_NAMES, SIZES, type LineName } from "./puzzle.ts";
import { decodeChallenge, encodeChallenge, formatTime, shareText, type Challenge, type PuzzleRef } from "./share.ts";
import {
  boardLayout,
  boardLetters,
  cellOfTile,
  clearBoard,
  clueLine,
  cluesLeft,
  elapsedMs,
  isEditable,
  isTileLocked,
  moveTile,
  newGame,
  pause,
  resume,
  letterHintLine,
  lettersLeft,
  submit,
  useClue,
  useLetterHint,
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
  clueButton: $<HTMLButtonElement>("clue-button"),
  letterButton: $<HTMLButtonElement>("letter-button"),
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
  archiveMonth: $("archive-month"),
  archiveSummary: $("archive-summary"),
  archivePrev: $<HTMLButtonElement>("archive-prev"),
  archiveNext: $<HTMLButtonElement>("archive-next"),
  archiveWeekdays: $("archive-weekdays"),
  archiveGrid: $("archive-grid"),
  archiveUnplayed: $<HTMLButtonElement>("archive-unplayed"),
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
/** The hint button under the mouse (or focused): its target is highlighted on the board. */
let hintPreview: "clue" | "letter" | null = null;
/** The square the last typed letter went to, so Backspace can undo it after the highlight jumped to the next word. */
let lastTyped: number | null = null;
let toast = "";
let trayKey = "";
let boardSize = 0;
let cellEls: HTMLElement[] = [];
let cluesEl: HTMLElement | null = null;
/** On the small 4-letter board one clue shows at a time: this one, unless the highlighted square's word has a clue. */
let clueShown: LineName | null = null;
/** What the clue panel shows now; it is only rebuilt when this changes (a rebuild mid-click loses the click). */
let cluesKey = "";
/** Definitions of the current word length, once loaded (for clue hints). */
let definitions: { size: number; words: Record<string, Definition> } | null = null;
/** The month the archive shows: [year, month (0-11)], kept while the page is open. */
let archiveMonth: [number, number] | null = null;
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
  // Clues (clue hints) are shown in the empty middle of the frame.
  cluesKey = "";
  cluesEl = document.createElement("div");
  cluesEl.className = "clues";
  cluesEl.setAttribute("aria-live", "polite");
  cluesEl.style.gridArea = `2 / 2 / ${size} / ${size}`;
  el.board.replaceChildren(...cellEls, cluesEl);
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
      return "Not quite, try again!";
    case "won":
      return "Solved!";
  }
  return "";
}

/** The word an editable cell belongs to (every non-corner cell is in exactly one word). */
function lineOfCell(cell: number | null): LineName | null {
  if (cell === null) return null;
  const { lines, corners } = boardLayout(state);
  if (corners.includes(cell)) return null;
  return LINE_NAMES.find((line) => lines[line].includes(cell)) ?? null;
}

function renderClues() {
  if (!cluesEl) return;
  const clues = state.clues ?? [];
  cluesEl.hidden = clues.length === 0;
  if (clues.length === 0) return;
  if (definitions?.size !== size) {
    const n = size;
    loadDefinitions(n)
      .then((words) => {
        definitions = { size: n, words };
        if (n === size) renderClues();
      })
      .catch(() => {});
    cluesEl.textContent = "Loading clues…";
    cluesKey = "";
    return;
  }
  const words = definitions.words;
  const cursorLine = lineOfCell(cursor);
  const active = cursorLine && clues.includes(cursorLine) ? cursorLine : clueShown && clues.includes(clueShown) ? clueShown : clues.at(-1)!;
  const [top, bottom, left, right] = state.puzzle;
  const answer: Record<LineName, string> = { top, bottom, left, right };
  const names: Record<LineName, string> = { top: "Top", bottom: "Bottom", left: "Left", right: "Right" };
  const key = [state.puzzle.join(), clues.join(), active].join("|");
  if (key === cluesKey) return;
  cluesKey = key;
  cluesEl.replaceChildren(
    ...clues.map((line) => {
      const p = document.createElement("p");
      p.className = "clue" + (line === active ? " active" : "");
      const label = document.createElement("strong");
      label.textContent = names[line];
      const text = words[answer[line]]?.text.split(";")[0] ?? "no clue available";
      p.append(label, ` ${text}`);
      return p;
    })
  );
  if (clues.length > 1) {
    const more = document.createElement("button");
    more.className = "clue-next";
    more.textContent = `${clues.indexOf(active) + 1}/${clues.length} ›`;
    more.setAttribute("aria-label", "Next clue");
    more.addEventListener("click", () => {
      clueShown = clues[(clues.indexOf(active) + 1) % clues.length];
      cursor = null; // so the chosen clue shows, not the highlighted square's
      render();
    });
    cluesEl.append(more);
  }
}

function render() {
  const letters = boardLetters(state);
  const { corners } = boardLayout(state);
  const playing = state.status === "playing";

  // Hovering a hint button shows where it goes: the square a letter fills, or the word a clue explains.
  const previewCells = new Set<number>();
  if (playing && hintPreview) {
    const preferred = lineOfCell(cursor);
    const line = hintPreview === "clue" ? clueLine(state, preferred) : letterHintLine(state, preferred);
    if (line) {
      const cells = boardLayout(state).lines[line];
      (hintPreview === "clue" ? cells : [cells[2]]).forEach((c) => previewCells.add(c));
    }
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
    div.classList.toggle("preview", previewCells.has(cell));
    if (tile !== null && !hinted && playing) div.dataset.tile = String(tile);
    else delete div.dataset.tile;
    div.setAttribute("aria-label", `${letters[cell] || "empty"}${corner ? ", given" : hinted ? ", hint" : ""}`);
  });
  el.board.classList.toggle("has-selection", selectedTile !== null);
  el.board.classList.toggle("solved", state.status === "won");

  renderTray();
  renderClues();

  const cluesLeftCount = cluesLeft(state).length;
  const lettersLeftCount = lettersLeft(state).length;
  el.message.textContent = feedbackText();
  el.clueButton.textContent = `Clue (${cluesLeftCount})`;
  el.clueButton.disabled = !playing || cluesLeftCount === 0;
  el.letterButton.textContent = `Letter (${lettersLeftCount})`;
  el.letterButton.disabled = !playing || lettersLeftCount === 0;
  el.clearButton.disabled = !playing;
  el.submitButton.disabled = !playing;
  el.pauseButton.hidden = state.status === "won";
  el.pauseButton.textContent = state.status === "paused" ? "Resume" : "Pause";
  el.pauseOverlay.hidden = state.status !== "paused";

  el.puzzleLabel.textContent =
    `#${mode === "practice" ? gameId + 1 : gameId}`; // the mode buttons say which kind
  el.puzzleLabel.title = mode === "practice" ? "" : shortDate(gameId);
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

type DayStatus = "solved" | "started" | "unplayed";

function dayStatus(day: number, inProgress: ReturnType<typeof loadGame>): DayStatus {
  if (results[day]) return "solved";
  return inProgress?.id === day && inProgress.state.status !== "won" ? "started" : "unplayed";
}

function hintsText(hints: number) {
  return hints === 0 ? "no hints" : hints === 1 ? "1 hint" : `${hints} hints`;
}

/** The archive is a calendar, one month at a time. Past days can be played; today links to the daily. */
function showArchive() {
  const todayNumber = today();
  const last = todayNumber - 1;
  const first = puzzleDate(1);
  const now = puzzleDate(todayNumber);
  if (!archiveMonth) {
    const latest = puzzleDate(Math.max(1, last));
    archiveMonth = [latest.getFullYear(), latest.getMonth()];
  }
  const [year, month] = archiveMonth;
  const inProgress = loadGame("archive", size);

  el.archiveTitle.textContent = `Archive${sizeSuffix(size)}`;
  el.archiveEmpty.hidden = last >= 1;
  el.archiveMonth.textContent = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  el.archivePrev.disabled = year * 12 + month <= first.getFullYear() * 12 + first.getMonth();
  el.archiveNext.disabled = year * 12 + month >= now.getFullYear() * 12 + now.getMonth();

  // Weekday names, Monday first (2024-01-01 was a Monday).
  el.archiveWeekdays.replaceChildren(
    ...Array.from({ length: 7 }, (_, i) => {
      const span = document.createElement("span");
      span.textContent = new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" });
      return span;
    })
  );

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  let solved = 0;
  let playable = 0;
  const squares: HTMLElement[] = Array.from({ length: offset }, () => document.createElement("span"));
  for (let date = 1; date <= daysInMonth; date++) {
    const day = puzzleNumber(new Date(year, month, date));
    const button = document.createElement("button");
    button.className = "archive-day";
    button.dataset.day = String(day);
    button.textContent = String(date);
    const label = new Date(year, month, date).toLocaleDateString(undefined, { day: "numeric", month: "long" });
    if (day < 1 || day > todayNumber) {
      button.disabled = true;
      button.classList.add("outside");
      button.setAttribute("aria-label", label);
    } else if (day === todayNumber) {
      button.classList.add("today");
      button.setAttribute("aria-label", `${label}, today's puzzle`);
      button.addEventListener("click", () => {
        leaveChallenge();
        startDaily();
      });
    } else {
      const status = dayStatus(day, inProgress);
      playable++;
      button.classList.add(status);
      const result = results[day];
      if (result) {
        solved++;
        if (result.hints > 0) {
          const badge = document.createElement("span");
          badge.className = "archive-hints";
          badge.textContent = String(result.hints);
          button.append(badge);
        }
      }
      const statusText = result ? `solved with ${hintsText(result.hints)}` : status === "started" ? "in progress" : "not played";
      button.setAttribute("aria-label", `Puzzle ${day}, ${label}, ${statusText}`);
      button.title = `#${day} · ${statusText}`;
      button.addEventListener("click", () => {
        leaveChallenge();
        startArchive(day);
      });
    }
    squares.push(button);
  }
  el.archiveGrid.replaceChildren(...squares);
  el.archiveSummary.textContent = playable ? `${solved} of ${playable} solved` : "";

  const unplayed = latestUnplayed(inProgress);
  el.archiveUnplayed.hidden = unplayed === null;
  el.archiveUnplayed.dataset.day = unplayed === null ? "" : String(unplayed);
  el.archiveUnplayed.textContent = unplayed === null ? "" : `Latest unsolved: #${unplayed}`;

  if (!el.archiveDialog.open) el.archiveDialog.showModal();
}

/** The most recent past puzzle that isn't solved yet. */
function latestUnplayed(inProgress: ReturnType<typeof loadGame>): number | null {
  for (let day = today() - 1; day >= 1; day--) if (dayStatus(day, inProgress) !== "solved") return day;
  return null;
}

function moveArchiveMonth(delta: number) {
  if (!archiveMonth) return;
  const d = new Date(archiveMonth[0], archiveMonth[1] + delta, 1);
  archiveMonth = [d.getFullYear(), d.getMonth()];
  showArchive();
}

el.archivePrev.addEventListener("click", () => moveArchiveMonth(-1));
el.archiveNext.addEventListener("click", () => moveArchiveMonth(1));
el.archiveUnplayed.addEventListener("click", () => {
  leaveChallenge();
  startArchive(Number(el.archiveUnplayed.dataset.day));
});

// ---------- Input: taps and drag and drop ----------

function tapCell(cell: number) {
  if (state.status !== "playing" || !isEditable(state, cell)) return;
  cursor = cell;
  lastTyped = null;
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

/**
 * Arrow keys: the next square straight in that direction. When there is none (the way to a
 * crossing word is blocked by a corner), the nearest square in that direction, so the
 * cursor can go all around the frame.
 */
function moveCursor(dr: number, dc: number) {
  const { editable, positions } = boardLayout(state);
  if (cursor === null) {
    cursor = firstEmptyCell() ?? editable.find((c) => isEditable(state, c)) ?? null;
    return;
  }
  const [r, c] = positions[cursor];
  let best: { cell: number; side: number; ahead: number } | null = null;
  for (const cell of editable) {
    if (!isEditable(state, cell)) continue;
    const [pr, pc] = positions[cell];
    const ahead = (pr - r) * dr + (pc - c) * dc; // distance in the arrow's direction
    const side = Math.abs((pr - r) * dc) + Math.abs((pc - c) * dr); // distance sideways
    if (ahead <= 0) continue;
    if (!best || side < best.side || (side === best.side && ahead < best.ahead)) best = { cell, side, ahead };
  }
  if (best) cursor = best.cell;
}

/** The squares of a word that can still be filled, in reading direction (down for left and right). */
function wordCells(line: LineName): number[] {
  return boardLayout(state).lines[line].filter((cell) => isEditable(state, cell));
}

/**
 * Where typing continues after a letter in `at`: the next empty square along the same word,
 * then the first empty square of the next words (top, left, right, bottom).
 */
function nextTypingCell(at: number): number | null {
  const order: LineName[] = ["top", "left", "right", "bottom"];
  const own = lineOfCell(at);
  const start = own ? order.indexOf(own) : 0;
  for (let i = 0; i < order.length; i++) {
    const cells = wordCells(order[(start + i) % order.length]);
    const from = i === 0 ? cells.indexOf(at) + 1 : 0;
    const ordered = i === 0 ? [...cells.slice(from), ...cells.slice(0, from)] : cells;
    const next = ordered.find((cell) => state.cells[cell] === null);
    if (next !== undefined) return next;
  }
  return null;
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
  cursor = nextTypingCell(at) ?? at;
  lastTyped = at;
  render();
}

function backspace() {
  if (cursor === null) return;
  // On an empty square, step back along the word first.
  if (state.cells[cursor] === null || !isEditable(state, cursor)) {
    const line = lineOfCell(cursor);
    const cells = line ? boardLayout(state).lines[line] : [];
    const before = cells.slice(0, cells.indexOf(cursor)).filter((c) => isEditable(state, c));
    const typed = lastTyped !== null && state.cells[lastTyped] !== null && isEditable(state, lastTyped) ? lastTyped : null;
    cursor = before.at(-1) ?? typed ?? cursor;
  }
  lastTyped = null;
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
  else if (key === "Enter") submitBoard();
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

// Hints go to the word with the highlighted square when they can.
el.clueButton.addEventListener("click", () => {
  setState(useClue(state, lineOfCell(cursor)));
  clueShown = state.clues?.at(-1) ?? null;
  render();
});
for (const [button, kind] of [
  [el.clueButton, "clue"],
  [el.letterButton, "letter"],
] as const) {
  const show = (on: boolean) => {
    hintPreview = on ? kind : null;
    render();
  };
  // Mouse only: on touch screens a tap would leave the highlight stuck.
  button.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && show(true));
  button.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && show(false));
  button.addEventListener("focus", () => button.matches(":focus-visible") && show(true));
  button.addEventListener("blur", () => show(false));
}
el.letterButton.addEventListener("click", () => {
  setState(useLetterHint(state, lineOfCell(cursor), Date.now()));
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
function submitBoard() {
  const next = submit(state, set.valid, Date.now());
  setState(next);
  if (next.feedback?.kind === "wrong" || next.feedback?.kind === "real-words") shake();
}
el.submitButton.addEventListener("click", submitBoard);

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

// Offline play and "add to home screen": only in the built site, not while developing.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("sw.js").catch(() => {
    // No offline support (e.g. private mode); the game works the same online.
  });
}

// First visit: explain the game.
if (!loadSetting("seen-help")) {
  saveSetting("seen-help", "1");
  el.helpDialog.showModal();
}
