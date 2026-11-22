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
  assert.equal(full.length, 8);
  assert.equal(full.find((e) => e.name === 'Plank').timed, 'sec');
  assert.equal(r.cardio.length, 2); // table-ish text skipped
  const squat = full[0];
  assert.deepEqual(squat.targets.map((t) => [t.from, t.sets]), [[1, 3], [3, 4]]);
  assert.equal(squat.recommended, '24 kg × 10');
  assert.deepEqual(squat.rec, [{ weight: 24, reps: 10 }]);
  const cyc = full.find((e) => e.name === 'Cycling');
  assert.deepEqual([cyc.sets, cyc.timed, cyc.rec[0].seconds], [1, 'min', 480]);
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

test('a network failure to Notion gives a clear error, not a crash', async () => {
  const { createNotionClient } = await import('../src/notion.js');
  const broken = createNotionClient('t', async () => { throw new TypeError('fetch failed'); });
  const res = await handleApi(new Request('http://localhost/api/people/amir/workouts'), {}, broken);
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /fetch failed/);
});

test("parses Rozhin's Block 2 layout: Day D, Wk 3+ column, block start date", async () => {
  const { parseRoutine, simplifyBlocks } = await import('../src/notion.js');
  const cell = (t) => [{ plain_text: t }];
  const row = (...c) => ({ type: 'table_row', table_row: { cells: c.map(cell) } });
  const blocks = simplifyBlocks([
    { type: 'callout', callout: { rich_text: [{ plain_text: 'Block 2, from ' }, { type: 'mention', plain_text: 'November 23, 2026', mention: { type: 'date', date: { start: '2026-11-23' } } }] } },
    { type: 'heading_2', heading_2: { rich_text: cell('Weekly schedule') } },
    { type: 'table', table: { has_column_header: true }, children: [row('Day', 'Session', 'If time is tight'), row('Fri', 'Day D: Lower body 2', '30-minute version'), row('Wed', 'Incline walk, 30 min, or rest', 'Skip')] },
    { type: 'heading_2', heading_2: { rich_text: cell('Day D — Lower body 2') } },
    { type: 'heading_3', heading_3: { rich_text: cell('45–60 minutes') } },
    { type: 'table', table: { has_column_header: true }, children: [row('Exercise', 'Sets × reps (Wk 1–2)', 'Wk 3+', 'Note'), row('Dumbbell Romanian deadlift', '3 × 10', '4 × 8–10', 'Main lift'), row('Elliptical', '5–10 min', '5–10 min', ''), row('Suitcase carry (dumbbell)', '3 × 30 sec / side', '3 × 40 sec / side', '')] },
  ]);
  const r = parseRoutine(blocks);
  assert.equal(r.block, 'Block 2');
  assert.equal(r.blockStart, '2026-11-23');
  assert.equal(r.schedule[0].session, 'Day D: Lower body 2');
  const d = r.days.D.versions['45–60 minutes'];
  assert.deepEqual(d[0].targets.map((t) => [t.from, t.sets, t.repsLow]), [[1, 3, 10], [3, 4, 8]]);
  assert.deepEqual([d[1].sets, d[1].timed], [1, 'min']);
  assert.equal(d[2].timed, 'sec');
  assert.equal(d[0].note, 'Main lift');
});

test('Exercise Plan is read per person; Set Log upserts by Session ID without duplicates', async () => {
  const cookie = await login();
  const plan = await (await call('people/rozhin/plan', {}, cookie)).json();
  assert.deepEqual(Object.keys(plan.days).sort(), ['A', 'B', 'C', 'Cardio', 'D']);
  const lat = plan.days.A.versions['45–60 minutes'].find((e) => e.name === 'Lat pulldown (cable)');
  assert.deepEqual([lat.recommended, lat.rec[0].weight, lat.rec[0].reps, lat.repsLow, lat.target], ['25 kg × 12', 25, 12, 10, '3 × 10–15']);
  assert.equal(plan.days.A.versions['30 minutes'].some((e) => e.name === 'Treadmill'), false);
  const amir = await (await call('people/amir/plan', {}, cookie)).json();
  assert.deepEqual(Object.keys(amir.days).sort(), ['A', 'B', 'C', 'Cardio']);
  const plank = amir.days.A.versions['45–60 minutes'].find((e) => e.name === 'Plank');
  assert.deepEqual([plank.timed, plank.rec[0].seconds, plank.recommended], ['sec', 40, '40 sec']);

  const session = { sessionId: '2026-11-23-Rozhin-A', date: '2026-11-23', day: 'A' };
  const items = [
    { key: 'k1', exercise: 'Lat pulldown (cable)', planId: lat.planId, set: 1, weight: 25, reps: 12, unit: 'reps', recW: 25, recR: 12, completed: true },
    { key: 'k2', exercise: 'Lat pulldown (cable)', planId: lat.planId, set: 2, weight: 25, reps: 11, unit: 'reps', completed: true },
    { key: 'k3', exercise: 'Plank', set: 1, weight: null, reps: 40, unit: 'sec', completed: true },
  ];
  const r1 = await (await call('people/rozhin/setlog', { method: 'POST', body: { ...session, items } }, cookie)).json();
  assert.equal(Object.keys(r1.saved).length, 3);
  // Saving again (even without page ids) updates instead of duplicating.
  items[1].reps = 10;
  const r2 = await (await call('people/rozhin/setlog', { method: 'POST', body: { ...session, items } }, cookie)).json();
  assert.equal(r2.errors.length, 0);
  let sets = await (await call('people/rozhin/sets', {}, cookie)).json();
  assert.equal(sets.length, 3);
  const s2 = sets.find((x) => x.set === 2);
  assert.deepEqual([s2.reps, s2.planId, s2.sessionId, s2.unit, s2.completed], [10, lat.planId, session.sessionId, 'reps', true]);
  assert.equal(sets.find((x) => x.exercise === 'Plank').weight, null);
  // Removing a set archives its row.
  await call('people/rozhin/setlog', { method: 'POST', body: { ...session, items: [{ key: 'k2', pageId: r1.saved.k2, exercise: 'Lat pulldown (cable)', set: 2, remove: true }] } }, cookie);
  sets = await (await call('people/rozhin/sets', {}, cookie)).json();
  assert.equal(sets.length, 2);
  // Amir sees none of Rozhin's sets.
  assert.equal((await (await call('people/amir/sets', {}, cookie)).json()).length, 0);
});
