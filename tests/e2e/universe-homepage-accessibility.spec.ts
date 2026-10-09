import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const route of ["/", "/?webgl=off"] as const) {
  test(`${route} has no serious or critical Axe violations`, async ({ page }) => {
    await page.goto(route);
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((violation) =>
        violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
  });
}

test("language and search tray controls expose state and remain accessible in both built-in languages", async ({ page }) => {
  await page.goto("/");
  const styles = page.getByRole("button", { name: "Styles" });
  await expect(styles).toHaveAttribute("aria-controls", "universe-search-tray");
  await expect(styles).toHaveAttribute("aria-expanded", "false");
  await styles.focus();
  await page.keyboard.press("Enter");
  await expect(styles).toHaveAttribute("aria-expanded", "true");

  const language = page.getByRole("button", { name: "Language" });
  await expect(language).toHaveAttribute("aria-controls", "language-menu-popover");
  await expect(language).toHaveAttribute("aria-expanded", "false");
  await language.focus();
  await page.keyboard.press("Enter");
  await expect(language).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Import CSV")).toHaveAttribute("accept", ".csv,text/csv");
  await page.getByRole("button", { name: "Simplified Chinese" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});

test("keyboard completes style, artist, release and hierarchical return", async ({ page }) => {
  await page.goto("/experiment/3d?webgl=off");

  const grunge = page.locator('[data-style-id="mw:style:grunge"]');
  await grunge.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/focus_id=mw%3Astyle%3Agrunge/);

  const nirvana = page.locator('[data-artist-id="mw:artist:nirvana"]');
  await nirvana.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/artist_id=mw%3Aartist%3Anirvana/);

  const bleach = page.locator('[data-release-group-id="mw:release-group:f1afec0b-26dd-3db5-9aa1-c91229a74a24"]');
  await bleach.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/release_group_id=/);
  await expect(page.getByRole("heading", { name: "Bleach" }).last()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/release_group_id=/);
  await expect(page).toHaveURL(/artist_id=/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/artist_id=/);
  await expect(page).toHaveURL(/focus_id=/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/focus_id=/);
});

test("forced colors switches the visual scene to the complete DOM fallback", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator('[data-od-id="universe-fallback"]')).toBeVisible();
  await expect(page.locator(".universe-overview-canvas canvas")).toHaveCount(0);
  await expect(page.locator("[data-style-id]")).toHaveCount(828);
  await page.locator('[data-style-id="mw:style:grunge"]').click();
  await expect(page.locator("[data-artist-id]")).toHaveCount(5);
});

test("WebGL context loss preserves state in the complete DOM fallback", async ({ page }) => {
  await page.goto("/?focus_id=mw%3Astyle%3Agrunge");
  const canvas = page.locator(".universe-overview-canvas canvas");
  await expect(canvas).toBeVisible();
  await canvas.dispatchEvent("webglcontextlost");

  await expect(page.locator('[data-od-id="universe-fallback"]')).toBeVisible();
  await expect(page.locator('[data-artist-id="mw:artist:nirvana"]')).toBeVisible();
  await expect(page).toHaveURL(/focus_id=mw%3Astyle%3Agrunge/);
});

test("unavailable style keeps source access and reports the evidence gap", async ({ page }) => {
  await page.goto("/?webgl=off");
  const rockAndRoll = page.locator('[data-style-id="mw:style:rock-and-roll"]');
  await rockAndRoll.click();
  await rockAndRoll.click();
  await expect(page.getByRole("status")).toContainText("No evidence path in this snapshot");
  await expect(page.getByRole("link", { name: "View style source" })).toHaveAttribute("href", /^https:\/\//);
});
