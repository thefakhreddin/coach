import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExercises, formatExercises, parseSet, parseRecommendation, formatSet } from '../src/sets.js';

test('round-trips the app format', () => {
  const ex = [
    { name: 'Goblet squat', sets: [{ weight: 20, reps: 10 }, { weight: 22.5, reps: 8 }] },
    { name: 'Push-ups', sets: [{ weight: null, reps: 12 }] },
    { name: 'Plank', sets: [{ seconds: 30 }] },
    { name: 'Empty', sets: [{ weight: 10, reps: '' }] },
  ];
  const text = formatExercises(ex);
  assert.equal(text, 'Goblet squat: 20kg×10, 22.5kg×8\nPush-ups: BW×12\nPlank: 30s');
  const back = parseExercises(text);
  assert.equal(back.length, 3);
  assert.deepEqual(back[0].sets, [{ weight: 20, reps: 10 }, { weight: 22.5, reps: 8 }]);
  assert.deepEqual(back[2].sets, [{ weight: null, reps: null, seconds: 30 }]);
});

test('understands hand-written variants', () => {
  assert.deepEqual(parseSet('20 x 10'), [{ weight: 20, reps: 10 }]);
  assert.deepEqual(parseSet('20,5kg*8'), [{ weight: 20.5, reps: 8 }]);
  assert.equal(parseSet('3x10 @ 15kg').length, 3);
  assert.deepEqual(parseSet('44lb x 10'), [{ weight: 20, reps: 10 }]);
  assert.deepEqual(parseSet('12 reps'), [{ weight: null, reps: 12 }]);
  assert.equal(parseSet('felt great'), null);
  assert.equal(parseExercises('- Row: 18kg×12; Press: 14×10')[1].sets[0].weight, 14);
});

test("reads Coach's recommended column", () => {
  assert.deepEqual(parseRecommendation('12 kg × 10'), [{ weight: 12, reps: 10 }]);
  assert.deepEqual(parseRecommendation('12 kg × 10, 10, 8').map((x) => [x.weight, x.reps]), [[12, 10], [12, 10], [12, 8]]);
  assert.deepEqual(parseRecommendation('12×10, 14×8').map((x) => [x.weight, x.reps]), [[12, 10], [14, 8]]);
  assert.deepEqual(parseRecommendation('18 kg'), [{ weight: 18, reps: null }]);
  assert.deepEqual(parseRecommendation('× 15'), [{ weight: null, reps: 15 }]);
  assert.equal(parseRecommendation('40 sec')[0].seconds, 40);
  assert.equal(parseRecommendation('8 min')[0].seconds, 480);
  assert.equal(parseRecommendation('22 lb × 10')[0].weight, 10);
  assert.deepEqual(parseRecommendation(''), []);
});

test('minutes round-trip', () => {
  assert.equal(formatSet({ seconds: 480 }), '8min');
  assert.equal(parseSet('8min')[0].seconds, 480);
  assert.equal(formatSet({ seconds: 40 }), '40s');
});
