import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../src/api.js';
import { createMockClient } from '../src/mock.js';
import { parseRoutine, simplifyBlocks } from '../src/notion.js';

const env = { APP_PASSWORD: 'secret', SESSION_SECRET: 'x' };
const client = createMockClient();
const call = (path, opts = {}, cookie = '') => handleApi(new Request(`http://localhost/api/${path}`, {
  method: opts.method || 'GET',
  headers: { 'content-type': 'application/json', cookie },
  body: opts.body ? JSON.stringify(opts.body) : undefined,
}), env, client);

async function login() {
  const res = await call('login', { method: 'POST', body: { password: 'secret' } });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

test('requires login', async () => {
  assert.equal((await call('people')).status, 401);
  assert.equal((await call('login', { method: 'POST', body: { password: 'nope' } })).status, 401);
});

test('parses the routine into days and schedule', async () => {
  const cookie = await login();
  const r = await (await call('people/amir/routine', {}, cookie)).json();
  assert.equal(r.block, 'Block 1');
  assert.deepEqual(Object.keys(r.days).sort(), ['A', 'B', 'C']);
  assert.equal(r.schedule.find((s) => s.day === 'Mon').session, 'Strength A');
  const full = r.days.A.versions['45–60 minutes'];
  assert.equal(full[0].name, 'Goblet squat');
  assert.equal(full[0].sets, 3);
  assert.equal(full.find((e) => e.name === 'Plank').timed, true);
});

test('logs a workout and reads it back parsed', async () => {
  const cookie = await login();
  const res = await call('people/rozhin/workouts', {
    method: 'POST',
    body: { date: '2026-11-18', session: 'Strength B', block: 'Block 1', rpe: 7, durationMin: 40,
      exercises: [{ name: 'Dumbbell Romanian deadlift', sets: [{ weight: 12, reps: 10 }, { weight: 12, reps: 9 }] }] },
  }, cookie);
  assert.equal(res.status, 201);
  const saved = await res.json();
  assert.equal(saved.exercisesText, 'Dumbbell Romanian deadlift: 12kg×10, 12kg×9');
  const list = await (await call('people/rozhin/workouts', {}, cookie)).json();
  assert.ok(list.some((w) => w.id === saved.id));

  // Cannot delete through the other person's route.
  assert.equal((await call(`people/amir/entries/${saved.id}`, { method: 'DELETE' }, cookie)).status, 403);
  assert.equal((await call(`people/rozhin/entries/${saved.id}`, { method: 'DELETE' }, cookie)).status, 200);
});

test('parses a real-shaped Notion table with header', () => {
  const blocks = simplifyBlocks([
    { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Day A — squat focus' }] } },
    { type: 'table', table: { has_column_header: true }, has_children: true, children: [
      { type: 'table_row', table_row: { cells: [[{ plain_text: 'Exercise' }], [{ plain_text: 'Sets × reps' }], [{ plain_text: 'Note' }]] } },
      { type: 'table_row', table_row: { cells: [[{ plain_text: 'Goblet squat' }], [{ plain_text: '3 × 8–12' }], [{ plain_text: 'Heels down' }]] } },
    ] },
  ]);
  const r = parseRoutine(blocks);
  assert.equal(r.days.A.versions.Workout[0].repsHigh, 12);
});

test('meals, targets and auto-save updates', async () => {
  const cookie = await login();
  const meals = await (await call('meals', {}, cookie)).json();
  assert.equal(meals.people.amir.everyday[0].slot, 'Breakfast');
  assert.equal(meals.people.rozhin.everyday[0].fasting, true);
  assert.equal(meals.people.amir.days.Wed.length, 2);
  assert.ok(meals.prep.some((p) => p.day === 'Sun'));
  const prof = await (await call('people/rozhin/profile', {}, cookie)).json();
  assert.deepEqual([prof.targets.kcal, prof.targets.protein], [1600, 120]);

  const created = await (await call('people/amir/workouts', { method: 'POST', body: { date: '2026-11-19', session: 'Strength B', exercises: [{ name: 'Row', sets: [{ weight: 20, reps: 10 }] }] } }, cookie)).json();
  const updated = await (await call(`people/amir/workouts/${created.id}`, { method: 'PATCH', body: { date: '2026-11-19', session: 'Strength B', exercises: [{ name: 'Row', sets: [{ weight: 20, reps: 10 }, { weight: 22, reps: 8 }] }] } }, cookie)).json();
  assert.equal(updated.exercisesText, 'Row: 20kg×10, 22kg×8');
  assert.equal((await call(`people/rozhin/workouts/${created.id}`, { method: 'PATCH', body: {} }, cookie)).status, 403);
});
