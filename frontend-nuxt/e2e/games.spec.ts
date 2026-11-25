import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLAYER_COLORS } from "../../frontend/lib/constants";

const screenshotDir = process.env.PILOT_SCREENSHOT_DIR || "test-results/screenshots";
const fixture = JSON.parse(readFileSync(new URL("../public/fixtures/games.json", import.meta.url), "utf8"));

test("actual chart series, overlays, themes and mobile layout", async ({ page, baseURL }) => {
  const external: string[] = [];
  const pageErrors: string[] = [];
  const local = new URL(baseURL!).origin;
  page.on("request", (request) => { if (new URL(request.url()).origin !== local) external.push(request.url()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("stats/games");
  await expect(page).toHaveURL(new URL("stats/games", baseURL!).href);
  await expect(page.locator(".day h2").first()).toContainText("Mi, 23. Sep");
  await expect(page.locator(".day").first().getByText("👑 Mira")).toBeVisible();
  const firstGame = page.locator('[data-game-id="9007"]');
  await firstGame.getByRole("button", { name: "Chart ausklappen" }).click();
  const chart = firstGame.locator(".chart");
  const miraLine = chart.locator(`svg path[stroke="${PLAYER_COLORS[0]}"][stroke-width="2.8"]`);
  await expect(miraLine).toHaveCount(1);
  await firstGame.getByRole("button", { name: "Mira", exact: true }).click();
  await expect(miraLine).toHaveCount(0);
  // The independent final-total reference must remain when the player line is hidden.
  const reference = chart.locator(`svg path[stroke="${PLAYER_COLORS[0]}"]`).first();
  await expect(reference).toBeAttached();
  expect(await reference.evaluate((element) => {
    const bounds = (element as SVGGraphicsElement).getBBox();
    return bounds.width > 0 && bounds.y >= 0 && bounds.y < 280;
  })).toBe(true);
  await firstGame.getByRole("button", { name: "PB Game", exact: true }).click();
  await expect(firstGame.getByRole("button", { name: "Mira PB Game", exact: true })).toHaveAttribute("aria-pressed", "true");
  await firstGame.getByRole("button", { name: "Offene Frames", exact: true }).click();
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await expect(chart).toContainText("Mira PB Game: 60");
  await expect(chart).toContainText("Offene Frames %: 0");
  await expect(chart).not.toContainText("Rundenzahl:");
  await firstGame.getByRole("button", { name: "Mira", exact: true }).click();
  await expect(miraLine).toHaveCount(1);
  await expect(firstGame.getByText("Goldener Pin: Strike", { exact: false })).toBeVisible();
  await expect(chart.locator('svg path[fill="#eab308"]').first()).toBeVisible();

  mkdirSync(screenshotDir, { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(screenshotDir, "nuxt-games-light.png"), fullPage: true });
  await page.getByRole("button", { name: "Darstellung umschalten" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: join(screenshotDir, "nuxt-games-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chart).toHaveCSS("height", "280px");
  await expect(chart).toHaveCSS("touch-action", "pan-y");
  await expect(page.getByRole("navigation", { name: "Mobile Navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile Navigation" }).getByRole("link", { name: "Verlauf" })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(firstGame.locator(".table-scroll")).toBeVisible();
  expect(await firstGame.locator(".table-scroll").evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.screenshot({ path: join(screenshotDir, "nuxt-games-mobile.png"), fullPage: true });
  expect(external).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("single expanded chart, day remount and refresh semantics", async ({ page }) => {
  await page.goto("stats/games");
  const day = page.locator(".day").first();
  await day.getByRole("button", { name: "Chart ausklappen" }).first().click();
  await page.getByRole("button", { name: "PB Game", exact: true }).click();
  await day.getByRole("button", { name: "Spiele ausblenden" }).click();
  await expect(page.locator(".chart")).toHaveCount(0);
  await day.getByRole("button", { name: "Spiele anzeigen" }).click();
  await expect(page.locator(".chart")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "PB Game", exact: true })).toHaveAttribute("aria-pressed", "false");
  await day.getByRole("button", { name: "Chart ausklappen" }).click();
  await expect(page.locator(".chart")).toHaveCount(1);
  await expect(page.locator('[data-game-id="9008"] .winner')).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".chart")).toHaveCount(0);
});

test("actual split fixtures, Escape and outside dismissal", async ({ page }) => {
  await page.goto("stats/games");
  const splitDay = page.locator(".day").filter({ hasText: "Fr, 18. Sep" });
  await splitDay.getByRole("button", { name: "Spiele anzeigen" }).click();
  await splitDay.getByRole("button", { name: "Chart ausklappen" }).click();
  const triggers = page.getByRole("button", { name: "Split-Muster anzeigen" });
  await triggers.first().click();
  const dialog = page.getByRole("dialog", { name: "Split-Muster" });
  await expect(dialog).toContainText("Split offen");
  await expect(dialog.locator(".standing")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(triggers.first()).toBeFocused();
  await triggers.nth(1).click();
  await expect(dialog).toContainText("Split geräumt");
  await page.locator(".split-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
});

test("invalid nested data, empty, HTTP errors and recovery", async ({ page }) => {
  let response: unknown = {};
  let status = 200;
  await page.route("**/fixtures/games.json", (route) => route.fulfill({
    status, contentType: "application/json", body: JSON.stringify(response),
  }));
  await page.goto("stats/games");
  const error = page.getByRole("alert");
  await expect(error).toContainText("Spiele konnten nicht geladen werden.");
  const malformed = structuredClone(fixture);
  malformed[0].scores[0].frames[0].split = { isSplit: true };
  response = malformed;
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(error).toBeVisible();
  response = [];
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByText("Keine Spiele vorhanden.")).toBeVisible();
  status = 500;
  await page.reload();
  await expect(error).toBeVisible();
  status = 200;
  response = fixture;
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.locator(".day")).toHaveCount(6);
  await expect(error).toBeHidden();
});

test("root/deep links preserve mount path and theme survives reload", async ({ page, baseURL, request }) => {
  const mount = new URL(baseURL!).pathname;
  if (mount !== "/") {
    expect((await request.get(new URL("/stats/games", baseURL!).href)).status()).toBe(404);
  }
  await page.goto("./");
  await expect(page).toHaveURL(new URL("stats/games", baseURL!).href);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Darstellung umschalten" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Spieltage & Spiele" })).toBeVisible();
  await expect(page).toHaveURL(new URL("stats/games", baseURL!).href);
  await page.getByRole("navigation", { name: "Seitenkontext" }).getByRole("link", { name: "Start" }).click();
  await expect(page).toHaveURL(new URL("stats/games", baseURL!).href);
});

test("independent day actions show a real aggregation preview and zero scores", async ({ page }) => {
  await page.goto("stats/games");
  const day = page.locator(".day").first();
  await day.getByRole("button", { name: "Tagesauswertung" }).click();
  const preview = day.getByRole("region", { name: "Tagesauswertung Vorschau" });
  await expect(preview).toContainText("VORSCHAU");
  await expect(preview).toContainText("Mira");
  await expect(preview).toContainText("390 Punkte");
  await expect(day.locator(".games")).toBeVisible();
  await day.getByRole("button", { name: "Spiele ausblenden" }).click();
  await expect(preview).toBeVisible();
  const zeroDay = page.locator(".day").filter({ hasText: "Di, 8. Sep" });
  await zeroDay.getByRole("button", { name: "Spiele anzeigen" }).click();
  await expect(zeroDay).toContainText("Kai: 0");
  await expect(zeroDay.getByText("Kein Spannungsvergleich bei einem Spieler")).toBeVisible();
  const emptyDay = page.locator(".day").filter({ hasText: "Do, 10. Sep" });
  await emptyDay.getByRole("button", { name: "Tagesauswertung" }).click();
  await expect(emptyDay.getByText("Keine Ergebnisse für diesen Tag.")).toBeVisible();
  await emptyDay.getByRole("button", { name: "Spiele anzeigen" }).click();
  await expect(emptyDay.getByText("Noch keine Wertung")).toBeVisible();
});

test("closed day and chart panels retain references and chart actions identify the game", async ({ page }) => {
  await page.goto("stats/games");
  const firstDay = page.locator(".day").first();
  const actions = firstDay.getByRole("button", { name: "Chart ausklappen" });
  await expect(actions).toHaveCount(2);
  expect(await actions.first().getAttribute("aria-label")).not.toBe(await actions.nth(1).getAttribute("aria-label"));
  const firstChartId = await actions.first().getAttribute("aria-controls");
  await expect(page.locator(`#${firstChartId}`)).toBeHidden();
  await actions.first().click();
  await expect(page.locator(`#${firstChartId}`)).toBeVisible();
  await firstDay.getByRole("button", { name: "Spiele ausblenden" }).click();
  await expect(firstDay.locator(".games")).toBeHidden();
  await expect(firstDay.locator(".games")).toHaveAttribute("id", await firstDay.getByRole("button", { name: "Spiele anzeigen" }).getAttribute("aria-controls") || "");
  const otherDay = page.locator(".day").nth(1);
  await expect(otherDay.locator(".games")).toBeHidden();
  const previewId = await otherDay.getByRole("button", { name: "Tagesauswertung" }).getAttribute("aria-controls");
  await expect(page.locator(`#${previewId}`)).toBeHidden();
});
