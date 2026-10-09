import { expect, test } from "@playwright/test";

test("header utilities use 14 pixel surfaces with 20 pixel visual gaps", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const modeButtons = page.locator(".universe-mode-tabs button");
    await expect(modeButtons).toHaveCount(4);
    const menuFontSizes = await modeButtons.evaluateAll((buttons) =>
      buttons.map((button) => getComputedStyle(button).fontSize)
    );
    expect(menuFontSizes).toEqual(["10px", "10px", "10px", "10px"]);

    const selectors = [
      ".motion-mode-trigger",
      ".language-menu-trigger",
      ".universe-directory-trigger",
    ];
    const visualBoxes = [];

    for (const selector of selectors) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeCloseTo(34, 1);
      expect(box!.height).toBeCloseTo(44, 1);
      const surface = await page.locator(selector).evaluate((element) => {
        const style = getComputedStyle(element, "::before");
        return { height: style.height, width: style.width };
      });
      expect(surface).toEqual({ height: "14px", width: "14px" });
      visualBoxes.push({
        left: box!.x + (box!.width - 14) / 2,
        right: box!.x + (box!.width + 14) / 2,
      });
    }

    expect(visualBoxes[1]!.left - visualBoxes[0]!.right).toBeCloseTo(20, 1);
    expect(visualBoxes[2]!.left - visualBoxes[1]!.right).toBeCloseTo(20, 1);
    expect(viewport.width - visualBoxes[2]!.right).toBeCloseTo(18, 1);
  }
});

test("language menu uses compact 10 pixel typography and icons", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator(".language-menu-trigger").click();

    const popover = page.locator(".language-menu-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toHaveCSS("width", "184px");
    await expect(popover).toHaveCSS("padding", "4px");

    const firstItem = popover.locator("button").first();
    await expect(firstItem).toHaveCSS("font-size", "10px");
    await expect(firstItem).toHaveCSS("min-height", "32px");
    const firstIcon = popover.locator("svg").first();
    await expect(firstIcon).toHaveCSS("width", "10px");
    await expect(firstIcon).toHaveCSS("height", "10px");
  }
});

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-wide-edge", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "400-percent-reflow", width: 320, height: 568 },
] as const) {
  test(`${viewport.name} keeps the homepage contained and operable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/?webgl=off");
    await expect(page.locator('[data-od-id="universe-homepage"]')).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);

    const modeTabs = page.locator(".universe-mode-tabs button");
    await expect(modeTabs).toHaveCount(4);
    for (const button of await modeTabs.all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    for (const control of [
      page.locator(".language-menu-trigger"),
      page.locator(".universe-directory-trigger"),
    ]) {
      await expectControlInsideViewport(control, viewport.width);
    }
    await expectHudControlsDoNotIntersect(page, viewport.width);

    const homepage = page.locator('[data-od-id="universe-homepage"]');
    await page.getByRole("button", { name: "Styles" }).click();
    await expect(homepage).toHaveAttribute("data-search-tray-open", "true");
    const searchBox = await page.locator(".universe-search").boundingBox();
    const collapseBox = await page.getByRole("button", { name: "Collapse search tools" }).boundingBox();
    expect(searchBox).not.toBeNull();
    expect(collapseBox).not.toBeNull();
    const collapseGap = collapseBox!.x - (searchBox!.x + searchBox!.width);
    expect(collapseGap).toBeGreaterThanOrEqual(0);
    expect(collapseGap).toBeLessThanOrEqual(8.5);
    await expectControlInsideViewport(
      page.getByRole("button", { name: "Collapse search tools" }),
      viewport.width,
    );
    await page.getByRole("button", { name: "Collapse search tools" }).click();
    await expect(homepage).toHaveAttribute("data-search-tray-open", "false");

    const counts = page.locator(".universe-counts-hud");
    await expect(counts).toBeVisible();
    const countBox = await counts.boundingBox();
    expect(countBox).not.toBeNull();
    expect(countBox!.x).toBeGreaterThanOrEqual(-0.5);
    expect(countBox!.x + countBox!.width).toBeLessThanOrEqual(viewport.width + 0.5);

    const grunge = page.locator('[data-style-id="mw:style:grunge"]');
    await grunge.click();
    await page.locator('[data-artist-id="mw:artist:nirvana"]').click();
    await expect(page.locator('[data-release-group-id]')).toHaveCount(2);

    for (const action of await page.locator(
      "[data-style-id]:visible, [data-artist-id]:visible, [data-release-group-id]:visible",
    ).all()) {
      const box = await action.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(-0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
    }

    await page.goto("/?focus_id=mw%3Astyle%3Agrunge");
    for (const name of ["Return to overview", "Collapse details"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(-0.5);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
    }
    const rail = page.locator('[data-od-id="universe-detail-rail"]');
    if (viewport.width <= 1199) {
      await expect(page.locator(".universe-counts-hud")).toBeHidden();
    } else {
      const focusedCountBox = await page.locator(".universe-counts-hud").boundingBox();
      const railBox = await rail.boundingBox();
      expect(focusedCountBox).not.toBeNull();
      expect(railBox).not.toBeNull();
      expect(rectanglesIntersect(focusedCountBox!, railBox!)).toBe(false);
    }
  });
}

async function expectHudControlsDoNotIntersect(
  page: import("@playwright/test").Page,
  viewportWidth: number,
): Promise<void> {
  const controls = await page.locator([
    ".universe-wordmark",
    ".universe-mode-tabs button",
    ".motion-mode-trigger",
    ".language-menu-trigger",
    ".universe-directory-trigger",
  ].join(", ")).all();
  const boxes = [];

  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(-0.5);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 0.5);
    boxes.push(box!);
  }

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      expect(rectanglesIntersect(boxes[leftIndex]!, boxes[rightIndex]!)).toBe(false);
    }
  }
}

async function expectControlInsideViewport(
  control: import("@playwright/test").Locator,
  viewportWidth: number,
): Promise<void> {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(34);
  expect(box!.height).toBeGreaterThanOrEqual(43.5);
  expect(box!.x).toBeGreaterThanOrEqual(-0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 0.5);
}

function rectanglesIntersect(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
}
