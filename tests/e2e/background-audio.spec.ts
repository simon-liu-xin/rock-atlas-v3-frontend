import { expect, test } from "@playwright/test";

const backgroundTrackUrl = process.env.VITE_BACKGROUND_TRACK_URL?.trim();

test("the default app creates no background player or media request", async ({ page }) => {
  test.skip(Boolean(backgroundTrackUrl), "requires the default server without an audio URL");
  const mediaRequests: string[] = [];
  await page.addInitScript(() => {
    let constructionCount = 0;
    Object.defineProperty(window, "__backgroundAudioConstructionCount", {
      get: () => constructionCount,
    });
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: function MockAudio() {
        constructionCount += 1;
        return document.createElement("audio");
      },
    });
  });
  page.on("request", (request) => {
    if (request.resourceType() === "media") mediaRequests.push(request.url());
  });

  await page.goto("/?webgl=off");

  await expect(page.locator('[data-od-id="background-audio-player"]')).toHaveCount(0);
  expect(await page.evaluate(() => (
    window as unknown as { __backgroundAudioConstructionCount: number }
  ).__backgroundAudioConstructionCount)).toBe(0);
  expect(mediaRequests).toEqual([]);
});

test("an opted-in track recovers from blocked autoplay through the compact control", async ({ page }) => {
  test.skip(!backgroundTrackUrl, "requires VITE_BACKGROUND_TRACK_URL");
  await page.addInitScript(() => {
    const audioCalls = { clicks: 0, pause: 0, play: 0, sources: [] as string[] };
    let manualPlaybackAllowed = false;
    Object.defineProperty(window, "__backgroundAudioCalls", { value: audioCalls });
    document.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".background-audio-trigger")) {
        manualPlaybackAllowed = true;
      }
    }, true);
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".background-audio-trigger")) {
        audioCalls.clicks += 1;
      }
    }, true);
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: function MockAudio(src?: string) {
        audioCalls.sources.push(src ?? "");
        return document.createElement("audio");
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        audioCalls.play += 1;
        return manualPlaybackAllowed
          ? Promise.resolve()
          : Promise.reject(new DOMException("blocked", "NotAllowedError"));
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value() {
        audioCalls.pause += 1;
      },
    });
  });

  await page.goto("/?webgl=off");
  const player = page.locator('[data-od-id="background-audio-player"]');
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute("data-audio-state", "blocked");
  await expect(player).toContainText("Autoplay blocked");

  const button = player.locator(".background-audio-trigger");
  await expect(page.getByRole("button", { name: "Play background audio" })).toBeVisible();
  const buttonBox = await button.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.width).toBe(44);
  expect(buttonBox!.height).toBe(44);
  await expect(button.locator("svg")).toHaveCSS("width", "10px");
  await expect(player).toHaveCSS("border-top-width", "0px");
  await expect(player).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await button.focus();
  await expect(button).toHaveCSS("outline-style", "none");

  const blockedCalls = await readAudioCalls(page);
  await page.mouse.move(
    buttonBox!.x + buttonBox!.width / 2,
    buttonBox!.y + buttonBox!.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(100);
  expect((await readAudioCalls(page)).clicks).toBe(blockedCalls.clicks);
  await page.mouse.up();
  const gestureCalls = await readAudioCalls(page);
  expect(gestureCalls.clicks).toBe(blockedCalls.clicks + 1);
  await expect(player).toHaveAttribute("data-audio-state", "playing");
  await expect(player).toContainText("Playing");
  await expect(page.getByRole("button", { name: "Pause background audio" })).toBeVisible();
  const playingCalls = await readAudioCalls(page);
  expect(playingCalls.pause).toBe(blockedCalls.pause);

  await page.getByRole("button", { name: "Pause background audio" }).click();
  await expect(player).toHaveAttribute("data-audio-state", "paused");
  await expect(player).toContainText("Paused");

  const calls = await readAudioCalls(page);
  expect(calls.play).toBe(playingCalls.play);
  expect(calls.pause).toBe(playingCalls.pause + 1);
  expect(calls.sources.length).toBeGreaterThanOrEqual(1);
  expect(calls.sources.every((source) => source === backgroundTrackUrl)).toBe(true);

  await page.getByRole("button", { name: "Play background audio" }).focus();
  await page.keyboard.press("Enter");
  await expect(player).toHaveAttribute("data-audio-state", "playing");
  await page.getByRole("button", { name: "Pause background audio" }).focus();
  await page.keyboard.press("Space");
  await expect(player).toHaveAttribute("data-audio-state", "paused");
});

test("the opted-in player stays contained and avoids an open detail rail", async ({ page }) => {
  test.skip(!backgroundTrackUrl, "requires VITE_BACKGROUND_TRACK_URL");
  await page.addInitScript(() => {
    Object.defineProperty(window, "Audio", {
      configurable: true,
      value: function MockAudio() {
        return document.createElement("audio");
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: () => Promise.resolve(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: () => undefined,
    });
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/?focus_id=mw%3Astyle%3Agrunge");
    await expect(page.locator('[data-od-id="background-audio-player"]')).toHaveClass(/has-detail-rail/);
    await expect.poll(async () => {
      const player = await page.locator('[data-od-id="background-audio-player"]').boundingBox();
      const rail = await page.locator('[data-od-id="universe-detail-rail"]').boundingBox();
      return player && rail ? rectanglesIntersect(player, rail) : true;
    }).toBe(false);

    const player = await page.locator('[data-od-id="background-audio-player"]').boundingBox();
    const detailRail = await page.locator('[data-od-id="universe-detail-rail"]').boundingBox();
    expect(player).not.toBeNull();
    expect(detailRail).not.toBeNull();
    expect(player!.x).toBeGreaterThanOrEqual(0);
    expect(player!.y).toBeGreaterThanOrEqual(0);
    expect(player!.x + player!.width).toBeLessThanOrEqual(viewport.width);
    expect(player!.y + player!.height).toBeLessThanOrEqual(viewport.height);
    expect(rectanglesIntersect(player!, detailRail!)).toBe(false);
  }
});

async function readAudioCalls(page: import("@playwright/test").Page) {
  return page.evaluate(() => (
    window as unknown as {
      __backgroundAudioCalls: { clicks: number; pause: number; play: number; sources: string[] };
    }
  ).__backgroundAudioCalls);
}

function rectanglesIntersect(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  return left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
}
