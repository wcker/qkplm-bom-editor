import assert from 'node:assert/strict';

export async function runDemoFunctionalGate({
  page,
  baseUrl,
  artifacts,
  desktopViewport,
}) {
  await page.setViewportSize({
    width: Math.min(1_280, desktopViewport.width),
    height: Math.min(800, desktopViewport.height),
  });
  await page.goto(baseUrl + '/', { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector('#session-status')?.textContent?.includes('就绪') === true,
    undefined,
    { timeout: 30_000 },
  );
  const treegrid = page.locator('[role="treegrid"]');
  await treegrid.waitFor({ state: 'visible' });
  const before = await inspectDemo(page);
  assert.equal(before.nodeCount, '10,000');
  assert.equal(before.visibleCount, '10,000');
  assert.equal(before.canvasCount, 3);
  assert.ok(before.canvasPixels.some((entry) => entry.nonWhite > 0));
  assert.equal(before.activeDescendantExists, true);
  assert.equal(before.columnHeaderCount > 0, true);
  assert.equal(before.rowHeaderCount > 0, true);
  assert.equal(before.scrollHeight > before.clientHeight, true);
  assert.equal(before.scrollWidth > before.clientWidth, true);
  assert.equal(before.verticalScrollbarGutter > 0, true);

  const accessibility = await inspectAccessibility(page);
  assert.equal(accessibility.treegridRole, true);
  assert.equal(accessibility.focusable, true);
  assert.equal(accessibility.multiselectable, true);
  assert.equal(accessibility.accessibleNamePresent, true);
  assert.equal(accessibility.rowCountValid, true);
  assert.equal(accessibility.columnCountValid, true);
  assert.equal(accessibility.rowIndicesValid, true);
  assert.equal(accessibility.columnIndicesValid, true);
  assert.equal(accessibility.headerNamesValid, true);
  assert.equal(accessibility.activeDescendantValid, true);
  assert.equal(accessibility.describedByValid, true);
  assert.equal(accessibility.duplicateIdCount, 0);

  const box = await treegrid.boundingBox();
  assert.notEqual(box, null);
  const interactionPoint = {
    x: box.x + 48 + 300 + 110,
    y: box.y + 36 + 14,
  };
  await page.mouse.click(interactionPoint.x, interactionPoint.y);
  await page.waitForFunction(
    (previous) => {
      const current = document
        .querySelector('[role="treegrid"]')
        ?.getAttribute('aria-activedescendant');
      return typeof current === 'string' && current !== previous;
    },
    before.activeDescendant,
    { timeout: 3_000 },
  );
  const afterClick = await inspectInteraction(page);
  assert.notEqual(afterClick.activeDescendant, before.activeDescendant);
  assert.equal(afterClick.activeElementRole, 'treegrid');
  assert.equal(afterClick.activeColumnIndex, '3');

  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    (previous) =>
      document
        .querySelector('[role="treegrid"]')
        ?.getAttribute('aria-activedescendant') !== previous,
    afterClick.activeDescendant,
    { timeout: 3_000 },
  );
  const afterArrow = await inspectInteraction(page);
  assert.notEqual(afterArrow.activeDescendant, afterClick.activeDescendant);
  assert.equal(afterArrow.activeElementRole, 'treegrid');

  await page.keyboard.press('Enter');
  const portal = page.locator('[data-bom-editor-portal]');
  await portal.waitFor({ state: 'visible', timeout: 3_000 });
  assert.equal(await portal.evaluate((element) => document.activeElement === element), true);
  await page.keyboard.press('Escape');
  await portal.waitFor({ state: 'hidden', timeout: 3_000 });
  assert.equal((await inspectInteraction(page)).activeElementRole, 'treegrid');

  await page.mouse.dblclick(interactionPoint.x, interactionPoint.y, { delay: 20 });
  await portal.waitFor({ state: 'visible', timeout: 3_000 });
  await page.keyboard.press('Escape');
  await portal.waitFor({ state: 'hidden', timeout: 3_000 });

  const scrollTopBefore = await treegrid.evaluate((element) => element.scrollTop);
  await page.mouse.move(interactionPoint.x, interactionPoint.y);
  await page.mouse.wheel(0, 560);
  await page.waitForFunction(
    (previous) => document.querySelector('[role="treegrid"]')?.scrollTop > previous,
    scrollTopBefore,
    { timeout: 3_000 },
  );
  const scrollTopAfter = await treegrid.evaluate((element) => element.scrollTop);
  await page.screenshot({
    path: artifacts.path('screenshots/desktop.png'),
    fullPage: false,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const mobile = await inspectResponsive(page);
  assert.equal(mobile.horizontalPageOverflow, false);
  assert.equal(mobile.buttonsFit, true);
  assert.equal(mobile.commandButtonsOverlap, false);
  assert.equal(mobile.canvasCount, 3);
  assert.equal(mobile.activeDescendantExists, true);
  await page.screenshot({
    path: artifacts.path('screenshots/mobile.png'),
    fullPage: false,
  });

  return Object.freeze({
    passed: true,
    before,
    pointerSelection: afterClick,
    keyboardNavigation: afterArrow,
    wheel: { scrollTopBefore, scrollTopAfter },
    accessibility,
    mobile,
  });
}

async function inspectDemo(page) {
  return page.evaluate(() => {
    const treegrid = document.querySelector('[role="treegrid"]');
    const activeDescendant = treegrid?.getAttribute('aria-activedescendant');
    const canvases = [...document.querySelectorAll('[data-bom-canvas-renderer] canvas')];
    const canvasPixels = canvases.map((canvas) => {
      const context = canvas.getContext('2d');
      if (context === null || canvas.width === 0 || canvas.height === 0) {
        return { width: canvas.width, height: canvas.height, nonWhite: 0 };
      }
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixelCount = canvas.width * canvas.height;
      const stride = Math.max(1, Math.floor(pixelCount / 20_000));
      let nonWhite = 0;
      for (let pixel = 0; pixel < pixelCount; pixel += stride) {
        const offset = pixel * 4;
        if (
          pixels[offset + 3] > 0 &&
          (pixels[offset] < 248 || pixels[offset + 1] < 248 || pixels[offset + 2] < 248)
        ) nonWhite += 1;
      }
      return { width: canvas.width, height: canvas.height, nonWhite };
    });
    return {
      nodeCount: document.querySelector('#node-count-value')?.textContent,
      visibleCount: document.querySelector('#visible-count-value')?.textContent,
      activeDescendant,
      activeDescendantExists:
        typeof activeDescendant === 'string' && document.getElementById(activeDescendant) !== null,
      canvasCount: canvases.length,
      canvasPixels,
      columnHeaderCount: document.querySelectorAll('[role="columnheader"]').length,
      rowHeaderCount: document.querySelectorAll('[role="rowheader"]').length,
      clientWidth: treegrid?.clientWidth ?? 0,
      clientHeight: treegrid?.clientHeight ?? 0,
      scrollWidth: treegrid?.scrollWidth ?? 0,
      scrollHeight: treegrid?.scrollHeight ?? 0,
      verticalScrollbarGutter: treegrid === null ? 0 : treegrid.offsetWidth - treegrid.clientWidth,
    };
  });
}

async function inspectInteraction(page) {
  return page.evaluate(() => {
    const treegrid = document.querySelector('[role="treegrid"]');
    const activeDescendant = treegrid?.getAttribute('aria-activedescendant');
    const activeCell = typeof activeDescendant === 'string' ? document.getElementById(activeDescendant) : null;
    const activeRow = activeCell?.closest('[role="row"]');
    return {
      activeDescendant,
      activeElementRole: document.activeElement?.getAttribute('role'),
      activeRowIndex: activeRow?.getAttribute('aria-rowindex'),
      activeColumnIndex: activeCell?.getAttribute('aria-colindex'),
    };
  });
}

async function inspectAccessibility(page) {
  return page.evaluate(() => {
    const treegrid = document.querySelector('[role="treegrid"]');
    if (treegrid === null) {
      return {
        treegridRole: false,
        focusable: false,
        multiselectable: false,
        accessibleNamePresent: false,
        rowCountValid: false,
        columnCountValid: false,
        rowIndicesValid: false,
        columnIndicesValid: false,
        headerNamesValid: false,
        activeDescendantValid: false,
        describedByValid: false,
        duplicateIdCount: 0,
      };
    }

    const parsePositiveInteger = (value) => {
      if (value === null || !/^\d+$/u.test(value)) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    };
    const rows = [...treegrid.querySelectorAll('[role="row"]')];
    const cells = [...treegrid.querySelectorAll('[role="gridcell"]')];
    const rowHeaders = [...treegrid.querySelectorAll('[role="rowheader"]')];
    const columnHeaders = [...treegrid.querySelectorAll('[role="columnheader"]')];
    const rowIndices = rows.map((row) =>
      parsePositiveInteger(row.getAttribute('aria-rowindex')),
    );
    const columnIndices = [
      ...cells,
      ...rowHeaders,
      ...columnHeaders,
    ].map((element) =>
      parsePositiveInteger(element.getAttribute('aria-colindex')),
    );
    const activeDescendant = treegrid.getAttribute('aria-activedescendant');
    const activeElement =
      activeDescendant === null ? null : document.getElementById(activeDescendant);
    const describedBy = treegrid.getAttribute('aria-describedby');
    const describedElement =
      describedBy === null ? null : document.getElementById(describedBy);
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    const idCounts = new Map();
    for (const id of ids) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);

    return {
      treegridRole: treegrid.getAttribute('role') === 'treegrid',
      focusable: treegrid.tabIndex === 0,
      multiselectable: treegrid.getAttribute('aria-multiselectable') === 'true',
      accessibleNamePresent:
        (treegrid.getAttribute('aria-label')?.trim().length ?? 0) > 0 ||
        (treegrid.getAttribute('aria-labelledby')?.trim().length ?? 0) > 0,
      rowCountValid:
        parsePositiveInteger(treegrid.getAttribute('aria-rowcount')) !== null,
      columnCountValid:
        parsePositiveInteger(treegrid.getAttribute('aria-colcount')) !== null,
      rowIndicesValid:
        rows.length > 0 &&
        rowIndices.every((index) => index !== null) &&
        rows.every((row) => {
          const level = row.getAttribute('aria-level');
          return level === null || parsePositiveInteger(level) !== null;
        }),
      columnIndicesValid:
        columnIndices.length > 0 && columnIndices.every((index) => index !== null),
      headerNamesValid:
        columnHeaders.length > 0 &&
        rowHeaders.length > 0 &&
        [...columnHeaders, ...rowHeaders].every(
          (header) => (header.textContent?.trim().length ?? 0) > 0,
        ),
      activeDescendantValid:
        typeof activeDescendant === 'string' &&
        activeDescendant.length > 0 &&
        activeElement?.getAttribute('role') === 'gridcell',
      describedByValid:
        describedBy === null ||
        (describedBy.length > 0 && describedElement !== null),
      duplicateIdCount: [...idCounts.values()].filter((count) => count > 1).length,
    };
  });
}

async function inspectResponsive(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.command-button')];
    const rects = buttons.map((button) => button.getBoundingClientRect());
    let commandButtonsOverlap = false;
    for (let left = 0; left < rects.length; left += 1) {
      for (let right = left + 1; right < rects.length; right += 1) {
        const a = rects[left];
        const b = rects[right];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          commandButtonsOverlap = true;
        }
      }
    }
    const treegrid = document.querySelector('[role="treegrid"]');
    const activeDescendant = treegrid?.getAttribute('aria-activedescendant');
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      horizontalPageOverflow: document.documentElement.scrollWidth > innerWidth,
      buttonsFit: buttons.every((button) => button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight),
      commandButtonsOverlap,
      canvasCount: document.querySelectorAll('[data-bom-canvas-renderer] canvas').length,
      activeDescendantExists:
        typeof activeDescendant === 'string' && document.getElementById(activeDescendant) !== null,
    };
  });
}
