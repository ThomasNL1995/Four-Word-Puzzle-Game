import { layout } from "./puzzle.ts";

export type PuzzleRef =
  | { kind: "daily"; size: number; number: number }
  | { kind: "practice"; size: number; index: number };

export interface Challenge {
  ref: PuzzleRef;
  hints: number;
  seconds: number;
}

// The challenge code is not secret, just not readable or casually editable:
// "d.142.1.83" (+ a small checksum) in base64url. 5 and 6 letter puzzles use "d5" / "p6" etc.
function checksum(text: string): string {
  let hash = 7;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 1679616;
  return hash.toString(36);
}

export function encodeChallenge({ ref, hints, seconds }: Challenge): string {
  const kind = (ref.kind === "daily" ? "d" : "p") + (ref.size === 4 ? "" : ref.size);
  const id = ref.kind === "daily" ? ref.number : ref.index;
  const body = `${kind}.${id}.${hints}.${Math.round(seconds)}`;
  return btoa(`${body}.${checksum(body)}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeChallenge(code: string): Challenge | null {
  try {
    const text = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const parts = text.split(".");
    if (parts.length !== 5) return null;
    const [kind, idText, hintsText, secondsText, sum] = parts;
    if (checksum(parts.slice(0, 4).join(".")) !== sum) return null;
    const [id, hints, seconds] = [idText, hintsText, secondsText].map(Number);
    if (![id, hints, seconds].every(Number.isInteger)) return null;
    const match = /^([dp])([56]?)$/.exec(kind);
    if (!match) return null;
    const size = match[2] ? Number(match[2]) : 4;
    const ref: PuzzleRef = match[1] === "d" ? { kind: "daily", size, number: id } : { kind: "practice", size, index: id };
    return { ref, hints, seconds };
  } catch {
    return null;
  }
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = (s % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** The board as emoji: green for letters you placed, yellow for hints, black for the given corners. */
export function emojiBoard(hinted: readonly number[], size = 4): string {
  const { corners, positions } = layout(size);
  const rows = Array.from({ length: size }, () => new Array<string>(size).fill("⬜"));
  positions.forEach(([r, c], cell) => {
    rows[r][c] = corners.includes(cell) ? "⬛" : hinted.includes(cell) ? "🟨" : "🟩";
  });
  return rows.map((row) => row.join("")).join("\n");
}

export interface ShareResult {
  title: string;
  size: number;
  hinted: readonly number[];
  hints: number;
  wrongSubmits: number;
  seconds: number;
  url: string;
}

export function shareText(r: ShareResult): string {
  const hints = r.hints === 1 ? "1 hint" : `${r.hints} hints`;
  const wrong = r.wrongSubmits === 1 ? "1 wrong" : `${r.wrongSubmits} wrong`;
  return `${r.title}\n${emojiBoard(r.hinted, r.size)}\n${hints} · ${wrong} · ${formatTime(r.seconds)}\n${r.url}`;
}
