// Renders scripts/preview-image.html to public/preview.jpg (1200x630), the image link
// previews show when the game is shared.
//
//   node scripts/make-preview-image.mjs
//
// Uses Playwright's Chromium (or CHROMIUM_PATH).

import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL("scripts/preview-image.html", root).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("public/preview.jpg", root).pathname, type: "jpeg", quality: 88 });
await browser.close();
console.log("wrote public/preview.jpg");
