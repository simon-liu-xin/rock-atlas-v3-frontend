import { expect, test } from "@playwright/test";

const grungeQuestion = "Grunge 为什么同时连接 Punk、Metal 和 Alternative？";
const shoegazeQuestion = "Shoegaze 的声音空间如何连接 Alternative、Psychedelic 与 Indie？";

test("ordinary exploration records and reopens recent questions locally", async ({ page }) => {
  await page.goto("/experiment/3d");
  const grunge = page.locator('[data-style-id="mw:style:grunge"]').first();
  await grunge.click();
  await grunge.click();
  await page.getByRole("button", { name: "Choose another starting point" }).click();
  const shoegaze = page.locator('[data-style-id="mw:style:shoegaze"]').first();
  await shoegaze.click();
  await shoegaze.click();
  await page.getByRole("button", { name: "Choose another starting point" }).click();

  const recent = page.locator('[data-od-id="recent-explorations"]');
  await expect(recent.getByRole("heading", { name: "Recent explorations" })).toBeVisible();
  await expect(recent.locator(".recent-list > button")).toHaveCount(2);
  await expect(recent.locator(".recent-list > button").first()).toContainText("Shoegaze");
  await recent.locator(".recent-list").getByRole("button", { name: new RegExp(grungeQuestion) }).click();
  await expect(page).toHaveURL(/path=mw%3Apath%3Agrunge-crossroads/);

  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain("musicwiki:recent-explorations:v1");
  expect(keys.filter((key) => key.startsWith("musicwiki:research:"))).toEqual([]);
});

test("an older recent snapshot is labeled and can be explicitly cleared", async ({ page }) => {
  await page.addInitScript(({ question }) => {
    localStorage.setItem(
      "musicwiki:recent-explorations:v1",
      JSON.stringify([
        {
          state_schema_version: "1.0",
          snapshot: "experiment-v0",
          view: "editorial",
          path_id: "mw:path:grunge-crossroads",
          focus_id: "mw:style:grunge",
          question,
          visited_at: "2026-07-20T10:00:00.000Z",
        },
      ]),
    );
  }, { question: grungeQuestion });
  await page.goto("/experiment/editorial");

  const recent = page.locator('[data-od-id="recent-explorations"]');
  await expect(recent).toContainText("Snapshot updated");
  await recent.getByRole("button", { name: "Clear recent explorations" }).click();
  await expect(recent).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("musicwiki:recent-explorations:v1"))).toBeNull();
});

test("corrupt recent storage never blocks the entry", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("musicwiki:recent-explorations:v1", "{broken");
  });
  await page.goto("/experiment/2d");
  await expect(page.getByRole("heading", { name: "Start with an artist or question you know" })).toBeVisible();
  await expect(page.locator('[data-od-id="recent-explorations"]')).toHaveCount(0);
});
