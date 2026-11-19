import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMealCell, parseItem, slotInfo } from '../src/meals.js';

test('parses a meal cell with Coach numbers and estimates carbs/fat', () => {
  const m = parseMealCell('3 eggs + 1 slice toast + 3/4 cup Greek yogurt + tomato and cucumber (460 kcal / 40 g)');
  assert.equal(m.kcal, 460);
  assert.equal(m.protein, 40);
  assert.equal(m.items.length, 4);
  assert.equal(m.items[0].food, 'egg');
  assert.equal(m.items[0].amount, 3);
  assert.ok(m.carbs > 15 && m.carbs < 30);
  assert.ok(Math.abs(m.estimated.kcal - 460) < 40, `estimate ${m.estimated.kcal} should be near 460`);
});

test('parses units and alternatives', () => {
  assert.equal(parseItem('1 tbsp oil').amount, 3); // stored as tsp
  assert.equal(parseItem('half plate vegetables').amount, 0.5);
  const beef = parseItem('150 g cooked stew beef (or lamb)');
  assert.equal(beef.food, 'stewbeef');
  assert.equal(beef.amount, 150);
  assert.equal(parseItem('1.5 cups cooked lentils').amount, 1.5);
  assert.equal(parseMealCell('—'), null);
  assert.equal(parseMealCell('Fasting until 12:00 (black coffee)').fasting, true);
});

test('works out meal times per person', () => {
  assert.equal(slotInfo('Snack, about 15:30 (Rozhin) / 4pm (Amir)', 'Amir').minutes, 16 * 60);
  assert.equal(slotInfo('Snack, about 15:30 (Rozhin) / 4pm (Amir)', 'Rozhin').minutes, 15 * 60 + 30);
  assert.equal(slotInfo('Breakfast, about 8am', 'Amir').slot, 'Breakfast');
  assert.equal(slotInfo('Sun dinner', 'Amir').slot, 'Dinner');
});
