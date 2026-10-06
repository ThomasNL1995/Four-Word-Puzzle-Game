import { expect, type Locator, type Page } from "@playwright/test";
import { layout, solutionLetters, type Puzzle } from "../src/puzzle.ts";

export interface Setup {
  size?: number;
  /** Pretend it is this (local) date, e.g. to have past puzzles in the archive. */
  date?: Date;
}

/** Opens the game with the help dialog already seen, optionally at a word length and date. */
export async function openGame(page: Page, { size = 4, date }: Setup = {}) {
  if (date) await page.clock.setFixedTime(date);
  await page.addInitScript((s) => {
    localStorage.setItem("word-weaver:seen-help", "1");
    if (!localStorage.getItem("word-weaver:size")) localStorage.setItem("word-weaver:size", String(s));
  }, size);
  await page.goto("/");
  await expect(page.locator(".tile").first()).toBeVisible();
}

/** The puzzle currently on the board, read from the saved game. */
export async function currentPuzzle(page: Page, slot: "daily" | "archive" | "practice" = "daily", size = 4) {
  const key = `word-weaver:${slot}${size === 4 ? "" : `:${size}`}`;
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), key);
  const puzzle = saved.state.puzzle as Puzzle;
  return { puzzle, solution: solutionLetters(puzzle), layout: layout(puzzle[0].length), state: saved.state };
}

export const cell = (page: Page, index: number) => page.locator(`[data-cell="${index}"]`);

export async function trayTile(page: Page, letter: string): Promise<Locator> {
  const tiles = page.locator(".tile:visible");
  const count = await tiles.count();
  for (let i = 0; i < count; i++) {
    if ((await tiles.nth(i).textContent()) === letter) return tiles.nth(i);
  }
  throw new Error(`No ${letter} in the tray`);
}

async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function mouseDrag(page: Page, from: Locator, to: Locator) {
  const a = await center(from);
  const b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
  await page.mouse.up();
}

export async function touchDrag(page: Page, from: Locator, to: Locator) {
  const a = await center(from);
  const b = await center(to);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a] });
  for (let i = 1; i <= 12; i++) {
    const point = { x: a.x + ((b.x - a.x) * i) / 12, y: a.y + ((b.y - a.y) * i) / 12 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Fills every empty square with the right letter by tapping it and typing. */
export async function solveByTyping(page: Page, solution: string[], editable: number[]) {
  for (const index of editable) {
    const square = cell(page, index);
    if ((await square.textContent()) !== "") continue;
    await square.click();
    await page.keyboard.press(solution[index]);
  }
}

export async function expectNoScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - innerWidth,
    y: document.documentElement.scrollHeight - innerHeight,
  }));
  expect(overflow).toEqual({ x: 0, y: 0 });
}
