import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExercises, formatExercises, parseSet } from '../src/sets.js';

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
