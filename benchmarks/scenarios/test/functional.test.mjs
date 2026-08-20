import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const functionalGate = await readFile(
  new URL('../scripts/lib/functional.mjs', import.meta.url),
  'utf8',
);

test('functional gate waits for a real pointer selection before inspecting it', () => {
  const click = functionalGate.indexOf(
    'await page.mouse.click(interactionPoint.x, interactionPoint.y);',
  );
  const selectionWait = functionalGate.indexOf(
    'before.activeDescendant,\n    { timeout: 3_000 },',
    click,
  );
  const inspect = functionalGate.indexOf(
    'const afterClick = await inspectInteraction(page);',
  );

  assert.ok(click >= 0);
  assert.ok(selectionWait > click);
  assert.ok(selectionWait < inspect);
  assert.match(
    functionalGate,
    /typeof current === 'string' && current !== previous/,
  );
});
