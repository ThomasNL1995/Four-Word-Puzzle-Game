import { CORNERS } from "./puzzle.ts";

export type PuzzleRef = { kind: "daily"; number: number } | { kind: "practice"; index: number };

export interface Challenge {
  ref: PuzzleRef;
  hints: number;
  seconds: number;
}

// The challenge code is not secret, just not readable or casually editable:
// "d.142.1.83" (+ a small checksum) in base64url.
function checksum(text: string): string {
  let hash = 7;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 1679616;
  return hash.toString(36);
}

export function encodeChallenge({ ref, hints, seconds }: Challenge): string {
  const id = ref.kind === "daily" ? `d.${ref.number}` : `p.${ref.index}`;
  const body = `${id}.${hints}.${Math.round(seconds)}`;
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
    if (kind === "d") return { ref: { kind: "daily", number: id }, hints, seconds };
    if (kind === "p") return { ref: { kind: "practice", index: id }, hints, seconds };
    return null;
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
export function emojiBoard(hinted: readonly number[]): string {
  const cell = (i: number) => (CORNERS.includes(i) ? "⬛" : hinted.includes(i) ? "🟨" : "🟩");
  const gap = "⬜";
  return [
    [0, 1, 2, 3].map(cell).join(""),
    cell(4) + gap + gap + cell(5),
    cell(6) + gap + gap + cell(7),
    [8, 9, 10, 11].map(cell).join(""),
  ].join("\n");
}

export interface ShareResult {
  title: string;
  hinted: readonly number[];
  hints: number;
  wrongSubmits: number;
  seconds: number;
  url: string;
}

export function shareText(r: ShareResult): string {
  const hints = r.hints === 1 ? "1 hint" : `${r.hints} hints`;
  const wrong = r.wrongSubmits === 1 ? "1 wrong" : `${r.wrongSubmits} wrong`;
  return `${r.title}\n${emojiBoard(r.hinted)}\n${hints} · ${wrong} · ${formatTime(r.seconds)}\n${r.url}`;
}
