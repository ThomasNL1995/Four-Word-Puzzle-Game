import { expect, test } from "@playwright/test";
import { encodeChallenge } from "../src/share.ts";
import {
  cell,
  currentPuzzle,
  expectNoScroll,
  mouseDrag,
  openGame,
  solveByTyping,
  touchDrag,
  trayTile,
} from "./helpers.ts";

test.describe("placing letters", () => {
  test("drag, swap and remove with the mouse", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "mouse only");
    await openGame(page);
    const { solution } = await currentPuzzle(page);

    await mouseDrag(page, await trayTile(page, solution[1]), cell(page, 1));
    await expect(cell(page, 1)).toHaveText(solution[1]);

    await (await trayTile(page, solution[2])).click();
    await cell(page, 2).click();
    await expect(cell(page, 2)).toHaveText(solution[2]);

    // Drag one placed letter onto the other: they swap.
    await mouseDrag(page, cell(page, 2), cell(page, 1));
    await expect(cell(page, 1)).toHaveText(solution[2]);
    await expect(cell(page, 2)).toHaveText(solution[1]);

    // Drag off the board: back to the tray.
    await mouseDrag(page, cell(page, 1), page.locator("#tray"));
    await expect(cell(page, 1)).toHaveText("");
  });

  test("drag and tap with touch", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "touch only");
    await openGame(page);
    const { solution, layout } = await currentPuzzle(page);
    const [a, b] = [layout.editable[0], layout.editable.at(-1)!];

    await touchDrag(page, await trayTile(page, solution[a]), cell(page, a));
    await expect(cell(page, a)).toHaveText(solution[a]);
    await touchDrag(page, await trayTile(page, solution[b]), cell(page, b));
    await touchDrag(page, cell(page, b), cell(page, a));
    await expect(cell(page, a)).toHaveText(solution[b]);

    // A tap right after a drag still works.
    const c = layout.editable[3];
    await (await trayTile(page, solution[c])).tap();
    await cell(page, c).tap();
    await expect(cell(page, c)).toHaveText(solution[c]);
  });
});

test("solve the daily with a wrong guess and a hint", async ({ page }) => {
  await openGame(page);
  const { solution, layout } = await currentPuzzle(page);

  // A wrong board first: swap two different letters in the top word.
  await solveByTyping(page, solution, layout.editable);
  if (solution[1] !== solution[2]) {
    await cell(page, 1).click(); // removes the letter
    await cell(page, 2).click();
    await cell(page, 1).click();
    await page.keyboard.press(solution[2]);
    await page.keyboard.press(solution[1]);
    await page.locator("#submit-button").click();
    await expect(page.locator("#message")).toContainText("Not quite");
    await page.locator("#clear-button").click();
  }

  await page.locator("#hint-button").click();
  await expect(page.locator("#hint-button")).toHaveText("Hint (5)");
  await solveByTyping(page, solution, layout.editable);
  await page.keyboard.press("Enter");

  await expect(page.locator("#result-dialog")).toBeVisible();
  await expect(page.locator("#result-hints")).toHaveText("1");
  await page.locator(".result-word").first().click();
  await expect(page.locator("#definition")).toContainText("(");

  // Coming back later shows the solved puzzle again.
  await page.reload();
  await expect(page.locator("#result-dialog")).toBeVisible();
  await page.locator("#result-dialog [data-close]").click();
  await page.locator("#stats-button").click();
  await expect(page.locator("#stat-streak")).toHaveText("1");
});

test("a hint on the highlighted square moves the highlight on", async ({ page }) => {
  await openGame(page);
  const { solution, layout } = await currentPuzzle(page);
  const [first, second, ...rest] = layout.editable;
  await solveByTyping(page, solution, rest);
  await cell(page, first).click();
  await page.locator("#hint-button").click();
  const { state } = await currentPuzzle(page);
  const cursor = page.locator(".cell.cursor");
  await expect(cursor).toHaveAttribute("data-cell", String(state.hinted[0] === first ? second : first));
});

for (const size of [5, 6]) {
  test(`play the ${size}-letter daily`, async ({ page }) => {
    await openGame(page);
    await page.locator(`[data-size-choice="${size}"]`).click();
    await expect(page.locator(".cell")).toHaveCount(4 * size - 4);
    await expect(page.locator("#hint-button")).toHaveText(`Hint (${(size - 2) * 3})`);
    await expectNoScroll(page);

    const { solution, layout } = await currentPuzzle(page, "daily", size);
    await solveByTyping(page, solution, layout.editable);
    await page.keyboard.press("Enter");
    await expect(page.locator("#result-dialog")).toBeVisible();

    // The 4-letter daily is separate and still unsolved.
    await page.locator("#result-dialog [data-close]").click();
    await page.locator('[data-size-choice="4"]').click();
    await expect(page.locator(".cell")).toHaveCount(12);
    await expect(page.locator("#result-dialog")).toBeHidden();
  });
}

test("archive: play a past puzzle without touching the streak", async ({ page }) => {
  // Puzzle #3 is today, so #1 and #2 are in the archive.
  await openGame(page, { date: new Date(2026, 9, 8, 12) });
  await page.locator("#mode-archive").click();
  const days = page.locator(".archive-day");
  await expect(days).toHaveCount(2);
  await expect(days.first()).toContainText("#2");
  await expect(days.first()).toContainText("Not played");

  await days.first().click();
  await expect(page.locator("#puzzle-label")).toContainText("#2");
  const { solution, layout } = await currentPuzzle(page, "archive");
  await solveByTyping(page, solution, layout.editable);
  await page.keyboard.press("Enter");
  await expect(page.locator("#result-dialog")).toBeVisible();
  await expect(page.locator("#next-button")).toHaveText("More puzzles");

  await page.locator("#next-button").click();
  await expect(page.locator(".archive-day.solved")).toHaveCount(1);
  await expect(page.locator(".archive-day").first()).toContainText("No hints");
  await page.locator("#archive-dialog [data-close]").click();

  await page.locator("#stats-button").click();
  await expect(page.locator("#stat-streak")).toHaveText("0");
  await expect(page.locator("#stat-extra")).toContainText("Past puzzles solved: 1");
});

test("a challenge link opens the friend's puzzle", async ({ page }) => {
  const code = encodeChallenge({ ref: { kind: "daily", size: 5, number: 1 }, hints: 2, seconds: 95 });
  await page.clock.setFixedTime(new Date(2026, 9, 8, 12));
  await page.addInitScript(() => localStorage.setItem("word-weaver:seen-help", "1"));
  await page.goto(`/?c=${code}`);
  await expect(page.locator("#challenge-banner")).toContainText("2 hints in 1:35");
  await expect(page.locator(".cell")).toHaveCount(16);
  await expect(page.locator("#puzzle-label")).toContainText("#1");
  await expect(page.locator("#mode-archive")).toHaveAttribute("aria-pressed", "true");
});

for (const size of [4, 5, 6]) {
  test(`${size} letters fit the screen without scrolling`, async ({ page }) => {
    await openGame(page, { size });
    await expectNoScroll(page);
  });
}

test("works offline after the first visit, all word lengths included", async ({ page, context }) => {
  await openGame(page);
  // Wait until the service worker has stored everything and controls the page.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".cell")).toHaveCount(12);
  await page.locator('[data-size-choice="6"]').click();
  await expect(page.locator(".cell")).toHaveCount(20);
  await expect(page.locator(".tile")).toHaveCount(16);
  // The fonts were stored too, so it still looks right.
  expect(await page.evaluate(async () => (await document.fonts.load('1em "Alfa Slab One"')).length)).toBeGreaterThan(0);
});
