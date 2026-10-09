import { expect, test, type Locator } from "@playwright/test";
import { PNG } from "pngjs";

const rockPoloId = "mw:style:wikidata:q107602122";
const michaelJacksonId = "mw:artist:wikidata:q2831";
const thrillerId = "mw:release-group:wikidata:q44320";

test("giant nebula supports the complete style, artist and release workflow", async ({ page }) => {
  await page.goto("/");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  await expect(scene).toHaveAttribute("data-scene-ready", "true");
  await expect(scene).toHaveAttribute("data-artist-material", "particle-star-depth-v2");
  await expect(scene).toHaveAttribute("data-orbit-body-count", "0");
  await expect(scene).toHaveAttribute("data-artist-stars", "0");
  await expect(scene).toHaveAttribute("data-rendered-artist-stars", "0");
  await expect(scene).toHaveAttribute("data-visible-artist-labels", "0");
  await expect(scene.locator("[data-scene-artist-id]")).toHaveCount(0);
  await expect(scene).toHaveAttribute("data-bridge-visual", "semantic-particle-strands-v3");
  await expect(scene).toHaveAttribute(
    "data-bridge-palette",
    "fact:#00e5ff|hypothesis:#5b8cff",
  );
  await expect(scene).toHaveAttribute("data-nebula-visual", "seeded-spiral-arms-v1");
  await expect(scene).toHaveAttribute("data-orbit-visual", "kepler-particle-rings-v4");
  await expectGlobalOverviewContract(scene);

  const canvas = scene.locator("canvas");
  const image = PNG.sync.read(await canvas.screenshot());
  expect(nonBackgroundRatio(image)).toBeGreaterThan(0.012);

  const grungeLabel = scene.locator('[data-style-id="mw:style:grunge"]');
  const overviewStyleIds = await scene.locator("[data-style-id]").evaluateAll((labels) =>
    labels.map((label) => (label as HTMLElement).dataset.styleId!).filter(Boolean)
  );
  await expect(page.locator(".universe-wordmark")).toHaveCSS("color", "rgb(240, 196, 111)");
  await expect(grungeLabel.locator("strong")).toHaveCSS("color", "rgb(116, 217, 231)");
  await expect(grungeLabel).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(grungeLabel).toHaveCSS("border-top-width", "0px");
  await expect(grungeLabel).toHaveCSS("box-shadow", "none");

  await grungeLabel.click();
  await expect(grungeLabel.locator("strong")).toHaveCSS("color", "rgb(240, 196, 111)");
  await expect(grungeLabel).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(grungeLabel).toHaveCSS("border-top-width", "0px");
  await expect(grungeLabel).toHaveCSS("box-shadow", "none");
  await expect(scene).toHaveAttribute("data-rendered-artist-stars", "5");
  await expect(scene).toHaveAttribute("data-visible-artist-labels", "5");
  const contextStyleIds = await focusedStyleContextIds(scene);
  await expect(scene.locator("[data-style-id]")).toHaveCount(contextStyleIds.length);
  await expect(scene.locator('[data-style-id="mw:style:grunge"]')).toHaveCount(1);
  await expect(scene.locator('[data-style-id="mw:style:alternative-rock"]')).toHaveCount(1);
  await expect(scene.locator('[data-style-id="mw:style:heavy-metal"]')).toHaveCount(1);
  const unrelatedOverviewStyleId = overviewStyleIds.find((styleId) => !contextStyleIds.includes(styleId));
  expect(unrelatedOverviewStyleId).toBeDefined();
  await expect(scene.locator(`[data-style-id="${unrelatedOverviewStyleId}"]`)).toHaveCount(0);
  for (const flow of (await scene.getAttribute("data-bridge-flows"))?.split("|").filter(Boolean) ?? []) {
    const [sourceId, targetId] = flow.split(">");
    expect(contextStyleIds).toContain(sourceId);
    expect(contextStyleIds).toContain(targetId);
  }
  await expectPositiveBridgeContract(scene);
  await expect(scene).toHaveAttribute("data-bridge-mode", "focused");
  await expect(page.locator('[data-od-id="universe-detail-rail"] [data-artist-id]')).toHaveCount(5);

  await page.locator('[data-od-id="universe-detail-rail"] [data-artist-id="mw:artist:nirvana"]').click();
  await expect(scene).toHaveAttribute("data-rendered-artist-stars", "5");
  await expect(scene).toHaveAttribute("data-style-layer", "true");
  await expect(scene).toHaveAttribute("data-background-context", "blurred");
  await expect(scene.locator("[data-scene-artist-id]")).toHaveCount(5);
  await expect(scene.locator("[data-style-id]")).toHaveCount(contextStyleIds.length);
  await expect(scene.locator('[data-style-id="mw:style:rock"]')).toHaveCount(0);
  await expect(scene.locator("[data-scene-release-group-id]")).toHaveCount(2);
  await expect(page.locator('[data-od-id="universe-detail-rail"] [data-release-group-id]')).toHaveCount(2);

  const bleachId = "mw:release-group:f1afec0b-26dd-3db5-9aa1-c91229a74a24";
  await page.locator(
    `[data-od-id="universe-detail-rail"] [data-release-group-id="${bleachId}"]`,
  ).click();
  await expect(scene.locator(`[data-scene-release-group-id="${bleachId}"]`))
    .toHaveAttribute("aria-pressed", "true");
  const detail = page.locator(".universe-release-detail");
  await expect(detail).toContainText("Bleach");
  await expect(detail).toContainText("1989-08-08");
  await expect(detail.getByRole("link", { name: "Open release source" })).toHaveAttribute(
    "href",
    "https://musicbrainz.org/release-group/f1afec0b-26dd-3db5-9aa1-c91229a74a24",
  );

  await page.keyboard.press("Escape");
  await expect(scene.locator("[data-scene-release-group-id]")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(scene.locator("[data-scene-release-group-id]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expectGlobalOverviewContract(scene);
});

test("global labels expand at the zoom threshold and the map supports pan plus orbit", async ({ page }) => {
  await page.goto("/");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  const canvas = scene.locator("canvas");
  const grunge = scene.locator('[data-style-id="mw:style:grunge"]');

  await expectGlobalOverviewContract(scene);
  await expect(grunge).toHaveAttribute("data-projection-state", "visible");
  const initialAnchor = await projectedAnchor(grunge);
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
  await page.mouse.wheel(0, -1_800);
  await expect(scene).toHaveAttribute("data-style-label-tier", "expanded");
  await expect(scene).toHaveAttribute("data-eligible-style-labels", "70");
  await expect(scene.locator("[data-style-id]")).toHaveCount(70);

  const targetBeforePan = await cameraTarget(canvas);
  const distanceBeforePan = Number(await canvas.getAttribute("data-camera-distance"));
  await page.mouse.move(canvasBox!.x + canvasBox!.width * 0.48, canvasBox!.y + canvasBox!.height * 0.52);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(canvasBox!.x + canvasBox!.width * 0.58, canvasBox!.y + canvasBox!.height * 0.58, {
    steps: 8,
  });
  await page.mouse.up({ button: "middle" });
  await expect.poll(async () => distanceBetween(
    await cameraTarget(canvas),
    targetBeforePan,
  )).toBeGreaterThan(0.05);
  expect(Number(await canvas.getAttribute("data-camera-distance")))
    .toBeCloseTo(distanceBeforePan, 3);

  await page.mouse.move(canvasBox!.x + canvasBox!.width * 0.52, canvasBox!.y + canvasBox!.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + canvasBox!.width * 0.57, canvasBox!.y + canvasBox!.height * 0.48, {
    steps: 8,
  });
  await page.mouse.up();

  await expect.poll(async () => {
    const next = await projectedAnchor(grunge);
    return Math.hypot(next.x - initialAnchor.x, next.y - initialAnchor.y);
  }).toBeGreaterThan(0.5);
});

test("release orbit bodies converge across style and artist selections", async ({ page }) => {
  await page.goto("/");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  const rail = page.locator('[data-od-id="universe-detail-rail"]');
  const nirvanaReleaseId = "mw:release-group:f1afec0b-26dd-3db5-9aa1-c91229a74a24";

  await expect(scene).toHaveAttribute("data-orbit-body-count", "0");
  await scene.locator('[data-style-id="mw:style:grunge"]').click();
  await expect(scene).toHaveAttribute("data-orbit-body-count", "0");

  await rail.locator('[data-artist-id="mw:artist:nirvana"]').click();
  await expect(scene).toHaveAttribute("data-orbit-body-count", "2");
  await expect(scene).toHaveAttribute("data-orbit-max-radius", "0.29");
  await expect(scene.locator("[data-scene-release-group-id]")).toHaveCount(2);
  await rail.getByRole("button", { name: "Back to Grunge artists" }).click();
  await expect(scene).toHaveAttribute("data-orbit-body-count", "0");
  await expect(scene).toHaveAttribute("data-orbit-max-radius", "0");
  await expect(scene.locator("[data-scene-release-group-id]")).toHaveCount(0);

  await page.getByRole("button", { name: "Return to overview" }).click();
  await scene.locator('[data-style-id="mw:style:heavy-metal"]').click();
  await rail.locator('[data-artist-id="mw:artist:black-sabbath"]').click();
  await expect(scene).toHaveAttribute("data-orbit-body-count", "2");
  await expect(rail.locator("[data-release-group-id]")).toHaveCount(2);
  await expect(scene.locator(`[data-scene-release-group-id="${nirvanaReleaseId}"]`)).toHaveCount(0);
  await expect(rail.locator(`[data-release-group-id="${nirvanaReleaseId}"]`)).toHaveCount(0);
});

test("direct artist links create release orbits and overview clears them", async ({ page }) => {
  await page.goto("/?focus_id=mw%3Astyle%3Agrunge&artist_id=mw%3Aartist%3Anirvana");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');

  await expect(scene).toHaveAttribute("data-scene-ready", "true");
  await expect(scene).toHaveAttribute("data-orbit-body-count", "2");
  await expect(scene).toHaveAttribute("data-orbit-max-radius", "0.29");
  await page.getByRole("button", { name: "Return to overview" }).click();
  await expect(scene).toHaveAttribute("data-orbit-body-count", "0");
  await expect(scene).toHaveAttribute("data-orbit-max-radius", "0");
});

test("hovering an album slows and strengthens its orbit without changing selection", async ({ page }) => {
  await page.goto("/?focus_id=mw%3Astyle%3Agrunge&artist_id=mw%3Aartist%3Anirvana");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  const release = scene.locator("[data-scene-release-group-id]").first();
  const releaseId = await release.getAttribute("data-scene-release-group-id");

  expect(releaseId).not.toBeNull();
  await release.hover();
  await expect(scene).toHaveAttribute("data-hovered-release-group-id", releaseId!);
  await expect(scene).toHaveAttribute("data-hovered-orbit-speed-scale", "0.28");
  await expect(release).toHaveAttribute("data-orbit-interaction-state", "hovered");
  expect(new URL(page.url()).searchParams.get("release_group_id")).toBeNull();

  await page.mouse.move(4, 4);
  await expect(scene).toHaveAttribute("data-hovered-release-group-id", "");
  await expect(scene).toHaveAttribute("data-hovered-orbit-speed-scale", "1");

  await release.focus();
  await expect(scene).toHaveAttribute("data-hovered-release-group-id", releaseId!);
  await release.blur();
  await expect(scene).toHaveAttribute("data-hovered-release-group-id", "");
});

test("selecting an album keeps its artist label attached to the stellar anchor", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("rock-atlas:motion-mode:v1", "reduced");
  });
  await page.goto(`/?focus_id=${encodeURIComponent(rockPoloId)}`);

  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  const rail = page.locator('[data-od-id="universe-detail-rail"]');
  await rail.locator(`[data-artist-id="${michaelJacksonId}"]`).click();
  await expect(scene).toHaveAttribute("data-orbit-body-count", "1");
  await rail.locator(`[data-release-group-id="${thrillerId}"]`).click();

  const artistLabel = scene.locator(`[data-scene-artist-id="${michaelJacksonId}"]`);
  await expect(artistLabel).toHaveAttribute("data-projection-state", "visible");
  await expect.poll(async () => Number(
    await artistLabel.getAttribute("data-label-slot-x"),
  )).toBeCloseTo(0, 4);
  await expect.poll(async () => Number(
    await artistLabel.getAttribute("data-label-slot-y"),
  )).toBeCloseTo(0, 4);
  const releaseLabel = scene.locator(`[data-scene-release-group-id="${thrillerId}"]`);
  await expect(releaseLabel).toHaveAttribute("data-projection-state", "visible");
  await expect.poll(async () => Number(
    await releaseLabel.getAttribute("data-label-slot-y"),
  )).toBeCloseTo(0, 4);
  const readReleaseLabelClearance = () => releaseLabel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const sceneRect = element.closest('[data-od-id="universe-overview-scene"]')!
      .getBoundingClientRect();
    const style = getComputedStyle(element);
    const anchorX = sceneRect.left +
      Number.parseFloat(style.getPropertyValue("--universe-anchor-x")) / 100 * sceneRect.width;
    const anchorY = sceneRect.top +
      Number.parseFloat(style.getPropertyValue("--universe-anchor-y")) / 100 * sceneRect.height;
    const nearestX = Math.max(rect.left, Math.min(anchorX, rect.right));
    const nearestY = Math.max(rect.top, Math.min(anchorY, rect.bottom));
    return Math.hypot(anchorX - nearestX, anchorY - nearestY);
  });
  await expect.poll(readReleaseLabelClearance).toBeGreaterThanOrEqual(0.5);
  expect(await readReleaseLabelClearance()).toBeLessThanOrEqual(4.5);
  await expect(scene).toHaveAttribute("data-orbit-max-radius", "0.2");
  await expect.poll(() => new URL(page.url()).searchParams.get("release_group_id"))
    .toBe(thrillerId);
});

test("search, era and relation filters preserve deterministic semantic positions", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  const homepage = page.locator('[data-od-id="universe-homepage"]');
  const grunge = page.locator('[data-od-id="universe-overview-scene"] [data-style-id="mw:style:grunge"]');
  const before = await grunge.getAttribute("data-world-position");

  await expect(homepage).toHaveAttribute("data-search-tray-open", "false");
  await expect(page.locator(".universe-hud-primary")).toContainText("English");
  await expect(page.locator(".universe-hud-primary")).toContainText("List");
  const styleCount = Number(await homepage.getAttribute("data-style-count"));
  const artistCount = Number(await homepage.getAttribute("data-artist-count"));
  expect(styleCount).toBeGreaterThan(0);
  expect(artistCount).toBeGreaterThan(0);
  await expect(page.locator(".universe-counts-hud")).toContainText(`${styleCount} styles`);
  await expect(page.locator(".universe-counts-hud")).toContainText(`${artistCount} artists`);
  await expect(page.locator("body")).not.toContainText("experiment-v1");
  await page.getByRole("button", { name: "Styles" }).click();
  await expect(homepage).toHaveAttribute("data-search-tray-open", "true");
  const urlBeforeCollapse = page.url();
  await page.getByRole("button", { name: "Collapse search tools" }).click();
  await expect(homepage).toHaveAttribute("data-search-tray-open", "false");
  await expect(page).toHaveURL(urlBeforeCollapse);
  await page.getByRole("button", { name: "Styles" }).click();
  await page.getByLabel("Search styles or artists").fill("Nirvana");
  await page.locator(".universe-search-results").getByRole("button", { name: /Nirvana/ }).click();
  await expect(page).toHaveURL(/focus_id=mw%3Astyle%3Agrunge/);
  await expect(page).toHaveURL(/artist_id=mw%3Aartist%3Anirvana/);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Eras" }).click();
  await page.getByRole("button", { name: "Filter by era" }).click();
  await page.getByRole("option", { name: "1980s-present", exact: true }).click();
  await expect(grunge).toHaveAttribute("data-world-position", before!);
  await expect(page.locator('[data-style-id="mw:style:rock"]').first()).toHaveClass(/is-filtered/);

  await grunge.click();
  await page.getByRole("button", { name: "Relations" }).click();
  await page.getByRole("button", { name: "Filter by relation type" }).click();
  await page.getByRole("option", { name: "Subgenre lineage", exact: true }).click();
  await expectPositiveBridgeContract(page.locator('[data-od-id="universe-overview-scene"]'));
});

test("filter selection uses a leading yellow rule and utility popovers dismiss outside", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Eras" }).click();
  const eraTrigger = page.getByRole("button", { name: "Filter by era" });
  await eraTrigger.click();
  const eraListbox = page.getByRole("listbox", { name: "Filter by era" });
  await expect(eraListbox).toBeVisible();
  await expect(eraListbox).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(eraListbox).toHaveCSS("color", "rgb(236, 233, 225)");
  const selectedEra = page.getByRole("option", { name: "All eras", exact: true });
  await expect(selectedEra).toHaveCSS("color", "rgb(236, 233, 225)");
  await expect(selectedEra).toHaveCSS(
    "box-shadow",
    "rgb(240, 196, 111) 3px 0px 0px 0px inset",
  );
  await expect(selectedEra).toHaveCSS("outline-style", "none");
  await page.locator(".universe-home-main").click({ force: true, position: { x: 8, y: 8 } });
  await expect(eraListbox).toBeHidden();
  await expect(eraTrigger).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Relations" }).click();
  const relationTrigger = page.getByRole("button", { name: "Filter by relation type" });
  await relationTrigger.click();
  const relationListbox = page.getByRole("listbox", { name: "Filter by relation type" });
  await expect(relationListbox).toBeVisible();
  await expect(relationListbox).toContainText("Subgenre lineage");
  await expect(relationListbox).toContainText("Musical influence");
  await expect(relationListbox).not.toContainText("subgenre_of");
  await expect(relationListbox).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(await relationListbox.evaluate((listbox) => {
    const options = listbox.querySelectorAll<HTMLElement>('[role="option"]');
    const lastOption = options.item(options.length - 1);
    if (!lastOption) return false;
    const rect = lastOption.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === lastOption || lastOption.contains(hit);
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(relationListbox).toBeHidden();
  await expect(relationTrigger).toBeFocused();
  await relationTrigger.press("ArrowUp");
  const focusedRelation = page.getByRole("option", { name: "Musical influence", exact: true });
  await expect(focusedRelation).toBeFocused();
  await expect(focusedRelation).toHaveCSS("color", "rgb(236, 233, 225)");
  await expect(focusedRelation).toHaveCSS(
    "box-shadow",
    "rgb(240, 196, 111) 3px 0px 0px 0px inset",
  );
  await expect(focusedRelation).toHaveCSS("outline-style", "none");
  await page.keyboard.press("Escape");

  for (const control of [
    { button: "Motion mode", panel: "#motion-mode-popover" },
    { button: "Language", panel: "#language-menu-popover" },
    { button: "List view", panel: "#universe-directory-panel" },
  ]) {
    const trigger = page.getByRole("button", { name: control.button });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(control.panel);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    if (control.button === "List view") {
      await expect(panel).toHaveCSS("width", "310px");
      await expect(panel.locator(".universe-fallback")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(panel.locator(".universe-style-directory button").first()).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
    }
    await page.locator(".universe-counts-hud").click({ force: true });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(control.panel)).toBeHidden();
  }
});

test("second style activation opens evidence or reports that no path exists", async ({ page }) => {
  await page.goto("/");
  const grunge = page.locator('[data-od-id="universe-overview-scene"] [data-style-id="mw:style:grunge"]');
  await grunge.click();
  await grunge.click();
  await expect(page).toHaveURL(/path=mw%3Apath%3Agrunge-crossroads/);

  await page.goto("/");
  const rockAndRoll = page.locator('[data-od-id="universe-overview-scene"] [data-style-id="mw:style:rock-and-roll"]');
  await rockAndRoll.click();
  await rockAndRoll.click();
  await expect(page.getByRole("status")).toContainText("No evidence path in this snapshot");
  await expect(page).not.toHaveURL(/path=/);
});

test("labels follow the camera scale when the universe zooms out", async ({ page }) => {
  await page.goto("/");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  await expect(scene).toHaveAttribute("data-scene-ready", "true");
  const label = scene.locator('[data-style-id="mw:style:grunge"]');
  const initialScale = Number(await label.getAttribute("data-label-scale"));

  await scene.locator("canvas").dispatchEvent("wheel", { deltaMode: 0, deltaY: 1200 });

  await expect.poll(async () => Number(await label.getAttribute("data-label-scale"))).toBeLessThan(initialScale);
});

test("detail rail collapses independently and overview preserves filters", async ({ page }) => {
  await page.goto("/?mode=relation&era=1980s-present&relation_type=subgenre_of&focus_id=mw%3Astyle%3Agrunge");
  const rail = page.locator('[data-od-id="universe-detail-rail"]');
  await expect(rail).toBeVisible();

  await page.getByRole("button", { name: "Collapse details" }).click();
  await expect(rail).toBeHidden();
  await expect(page.getByRole("button", { name: "Expand details" })).toBeVisible();

  await page.locator('[data-scene-artist-id="mw:artist:nirvana"]').click();
  await expect(rail).toBeHidden();
  await page.getByRole("button", { name: "Expand details" }).click();
  await expect(rail).toBeVisible();
  await expect(rail).toContainText("Nirvana");

  await page.getByRole("button", { name: "Return to overview" }).click();
  await expect(page).not.toHaveURL(/focus_id|artist_id|release_group_id/);
  await expect(page).toHaveURL(/mode=relation/);
  await expect(page).toHaveURL(/era=1980s-present/);
  await expect(page).toHaveURL(/relation_type=subgenre_of/);
  await expect(page.getByRole("button", { name: "Return to overview" })).toBeDisabled();
});

test("pinch gestures are contained by the 3D scene", async ({ page }) => {
  await page.goto("/");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  await expect(scene).toBeVisible();

  const scenePrevented = await scene.evaluate((element) => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -180,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  const hudPrevented = await page.locator(".universe-hud").evaluate((element) => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -180,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(scenePrevented).toBe(true);
  expect(hudPrevented).toBe(false);
});

test("artist focus replaces the panel and keeps albums linked to orbit bodies", async ({ page }) => {
  await page.goto("/?focus_id=mw%3Astyle%3Agrunge");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  const rail = page.locator('[data-od-id="universe-detail-rail"]');

  await scene.locator('[data-scene-artist-id="mw:artist:nirvana"]').click();
  await expect(rail.getByRole("heading", { name: "Nirvana" })).toBeVisible();
  await expect(scene.locator("[data-scene-artist-id]")).toHaveCount(5);
  const contextStyleIds = await focusedStyleContextIds(scene);
  await expect(scene.locator("[data-style-id]")).toHaveCount(contextStyleIds.length);
  await expect(scene.locator('[data-scene-artist-id="mw:artist:nirvana"]')).toHaveAttribute("aria-pressed", "true");
  await expect(scene.locator('[data-style-id="mw:style:grunge"]')).toHaveClass(/is-context/);
  await expect(rail.getByRole("button", { name: "Back to Grunge artists" })).toBeVisible();
  await expect(rail.locator("[data-artist-id]")).toHaveCount(0);
  await expect(rail.locator("[data-release-group-id]")).toHaveCount(2);

  const bleachId = "mw:release-group:f1afec0b-26dd-3db5-9aa1-c91229a74a24";
  await rail.locator(`[data-release-group-id="${bleachId}"]`).click();
  await expect(scene.locator(`[data-scene-release-group-id="${bleachId}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(rail.locator(`[data-release-group-id="${bleachId}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(rail.locator(".universe-release-detail")).toContainText("Bleach");

  await rail.getByRole("button", { name: "Back to Grunge artists" }).click();
  await expect(page).not.toHaveURL(/artist_id|release_group_id/);
  await expect(scene.locator("[data-scene-release-group-id]")).toHaveCount(0);
  await expect(scene.locator(".universe-artist-label.is-deemphasized")).toHaveCount(0);
  await expect(rail.locator("[data-artist-id]")).toHaveCount(5);
  await expect(rail.getByRole("heading", { name: "Style lineage" })).toBeVisible();
  await expect(rail).not.toContainText("One-hop relations");

});

function nonBackgroundRatio(image: PNG): number {
  let changed = 0;
  const total = image.width * image.height;
  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index]!;
    const green = image.data[index + 1]!;
    const blue = image.data[index + 2]!;
    if (Math.abs(red - 3) + Math.abs(green - 5) + Math.abs(blue - 10) > 18) changed += 1;
  }
  return changed / total;
}

async function expectGlobalOverviewContract(scene: Locator): Promise<void> {
  await expect(scene).toHaveAttribute("data-bridge-mode", "overview");
  await expect(scene).toHaveAttribute("data-camera-controls", "orbit-rotate-pan-zoom");
  await expect(scene).toHaveAttribute("data-global-bridge-intensity", "0.5");
  await expect.poll(async () => Number(await scene.getAttribute("data-global-style-target")))
    .toBeGreaterThan(0);
  await expect(scene).toHaveAttribute("data-style-label-tier", "overview");
  await expect(scene).toHaveAttribute("data-eligible-style-labels", "18");
  await expect(scene.locator("[data-style-id]")).toHaveCount(18);
  await expect.poll(async () => Number(await scene.getAttribute("data-visible-style-labels")))
    .toBeGreaterThan(0);
  await expect.poll(async () => Number(await scene.getAttribute("data-bridge-count")))
    .toBeGreaterThan(0);

  const semanticStyleIds = (await scene.getAttribute("data-semantic-style-ids"))
    ?.split("|")
    .filter(Boolean) ?? [];
  expect(semanticStyleIds).not.toHaveLength(0);
  for (const styleId of semanticStyleIds) {
    await expect(scene.locator(`[data-style-id="${styleId}"]`)).toHaveCount(1);
  }

  const flows = (await scene.getAttribute("data-bridge-flows"))?.split("|").filter(Boolean) ?? [];
  for (const flow of flows) {
    const [sourceId, targetId] = flow.split(">");
    expect(semanticStyleIds).toContain(sourceId);
    expect(semanticStyleIds).toContain(targetId);
  }
}

async function expectPositiveBridgeContract(scene: Locator): Promise<void> {
  await expect.poll(async () => {
    const bridgeCount = Number(await scene.getAttribute("data-bridge-count"));
    const relationCount = Number(await scene.getAttribute("data-relation-count"));
    return relationCount > 0 && bridgeCount >= relationCount;
  }).toBe(true);
}

async function projectedAnchor(label: Locator): Promise<{ x: number; y: number }> {
  return label.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      x: Number.parseFloat(style.getPropertyValue("--universe-anchor-x")),
      y: Number.parseFloat(style.getPropertyValue("--universe-anchor-y")),
    };
  });
}

async function cameraTarget(canvas: Locator): Promise<[number, number, number]> {
  const value = await canvas.getAttribute("data-camera-target");
  expect(value).not.toBeNull();
  const coordinates = value!.split(",").map(Number);
  expect(coordinates).toHaveLength(3);
  expect(coordinates.every(Number.isFinite)).toBe(true);
  return coordinates as [number, number, number];
}

function distanceBetween(
  left: readonly number[],
  right: readonly number[],
): number {
  return Math.hypot(...left.map((value, index) => value - right[index]!));
}

async function focusedStyleContextIds(scene: Locator): Promise<string[]> {
  const ids = (await scene.getAttribute("data-focus-context-style-ids"))
    ?.split("|")
    .filter(Boolean) ?? [];
  expect(ids.length).toBeGreaterThan(1);
  await expect(scene).toHaveAttribute("data-focus-context-style-count", String(ids.length));
  return ids;
}

test("keeps animated navigation surfaces mounted and direction-aware", async ({ page }) => {
  await page.goto("/?focus_id=mw%3Astyle%3Agrunge");

  const indicator = page.locator(".universe-mode-indicator");
  await expect(indicator).toHaveAttribute("data-active-index", "0");

  const rail = page.locator('[data-od-id="universe-detail-rail"]');
  await expect(rail).toHaveAttribute("data-open", "true");
  await page.getByRole("button", { name: "Collapse details" }).click();
  await expect(rail).toHaveAttribute("data-open", "false");
  await expect(rail).toHaveAttribute("aria-hidden", "true");

  await page.getByRole("button", { name: "Expand details" }).click();
  await expect(rail).toHaveAttribute("data-open", "true");
  await rail.locator('[data-artist-id="mw:artist:nirvana"]').click();
  await expect(rail.locator('[data-od-id="universe-fallback"]')).toHaveAttribute(
    "data-detail-direction",
    "forward",
  );
  await expect(rail.locator('[data-od-id="universe-fallback"]')).toHaveAttribute(
    "data-detail-depth",
    "2",
  );
  await rail.getByRole("button", { name: "Back to Grunge artists" }).click();
  await expect(rail.locator('[data-od-id="universe-fallback"]')).toHaveAttribute(
    "data-detail-direction",
    "back",
  );
});

test("reveals search results from a stable skeleton slot", async ({ page }) => {
  await page.goto("/?webgl=off");
  await page.getByRole("button", { name: "Styles" }).click();
  await page.getByLabel("Search styles or artists").fill("Nirvana");

  const results = page.locator(".universe-search-results");
  await expect(results.locator(".universe-search-skeleton")).toHaveCount(1);
  await expect(results).toHaveAttribute("data-reveal-state", "revealed");
  await expect(results.getByRole("button", { name: /Nirvana/ })).toBeVisible();

  await page.getByLabel("Search styles or artists").fill("Pearl Jam");
  await expect(results.getByRole("button", { name: /Pearl Jam/ })).toBeVisible();

  await page.getByLabel("Search styles or artists").fill("zoomergaze");
  await results.getByRole("button", {
    exact: true,
    name: "zoomergaze Styles",
  }).click();
  await expect(page).toHaveURL(/focus_id=mw%3Astyle%3Awikidata%3Aq138605895/);
  await expect(page.locator('[data-od-id="universe-fallback"]')).toContainText(
    "My Bloody Valentine",
  );
});

test("plays semantic scene motion once and returns to a stable demand frame", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("rock-atlas:motion-mode:v1", "reduced");
  });
  await page.goto("/");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');
  await expect(scene).toHaveAttribute("data-scene-ready", "true");

  await scene.locator('[data-style-id="mw:style:grunge"]').click();
  await expect.poll(async () => {
    const ambient = Number(await scene.getAttribute("data-ambient-bridge-signals"));
    const signals = Number(await scene.getAttribute("data-bridge-signal-count"));
    return ambient > 0 && ambient === signals;
  }).toBe(true);
  await page.locator('[data-od-id="universe-detail-rail"] [data-artist-id="mw:artist:nirvana"]').click();
  await expect(scene).toHaveAttribute("data-artist-breathing", "true");
  await expect(scene).toHaveAttribute("data-orbit-body-count", "2");

  await page.getByRole("button", { name: "Styles" }).click();
  await page.getByLabel("Search styles or artists").fill("Nirvana");
  await expect(scene).toHaveAttribute("data-search-active", "true");
  await expect(scene).toHaveAttribute("data-search-scan-count", "1");

  await page.waitForTimeout(1_500);
  const canvas = scene.locator("canvas");
  const first = PNG.sync.read(await canvas.screenshot());
  await page.waitForTimeout(500);
  const second = PNG.sync.read(await canvas.screenshot());
  expect(pixelChangeRatio(first, second)).toBeLessThan(0.0001);
});

test("reduces scene density as a narrow viewport moves into artist focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const scene = page.locator('[data-od-id="universe-overview-scene"]');

  await expect(scene).toHaveAttribute("data-background-particles", "680");
  await expect(scene).toHaveAttribute("data-style-particles", "210");
  await scene.locator('[data-style-id="mw:style:grunge"]').click();
  await page.locator('[data-od-id="universe-detail-rail"] [data-artist-id="mw:artist:nirvana"]').click();
  await expect(scene).toHaveAttribute("data-background-particles", "520");
  await expect(scene).toHaveAttribute("data-style-particles", "160");
});

function pixelChangeRatio(first: PNG, second: PNG): number {
  expect(second.width).toBe(first.width);
  expect(second.height).toBe(first.height);
  let changed = 0;
  for (let index = 0; index < first.data.length; index += 4) {
    const delta = Math.abs(first.data[index]! - second.data[index]!) +
      Math.abs(first.data[index + 1]! - second.data[index + 1]!) +
      Math.abs(first.data[index + 2]! - second.data[index + 2]!);
    if (delta > 12) changed += 1;
  }
  return changed / (first.width * first.height);
}
