// In-memory stand-in for Notion, used by `npm run demo` and the tests.
// The routine mirrors the real "Current Routine" page structure (Block 1).
import { PEOPLE } from './config.js';

let seq = 0;
const rt = (t, extra = {}) => [{ plain_text: t, text: { content: t }, annotations: extra }];
const blk = (type, text, children) => ({
  id: `mock-${++seq}`, type, has_children: !!children, children,
  [type]: text == null ? {} : { rich_text: rt(text) },
});
const table = (rows) => ({
  id: `mock-${++seq}`, type: 'table', has_children: true,
  table: { has_column_header: true },
  children: rows.map((r) => ({ id: `mock-${++seq}`, type: 'table_row', table_row: { cells: r.map((c) => rt(c)) } })),
});

function routineBlocks() {
  return [
    { ...blk('callout', 'Block 1 — start 2026-11-16, review around 2026-11-30.'), callout: { rich_text: rt('Block 1 — start 2026-11-16, review around 2026-11-30.'), icon: { emoji: '📌' } } },
    blk('paragraph', 'This is the first two weeks of the 4-week starter.'),
    blk('heading_2', 'Weekly schedule'),
    table([['Day', 'Session', 'If time is tight'], ['Mon', 'Strength A', '30-minute version'], ['Tue', 'Incline walk or cardio', '30-minute version'],
      ['Wed', 'Strength B', '30-minute version'], ['Thu', 'Incline walk or cardio', '30-minute version'], ['Fri', 'Strength C', '30-minute version'],
      ['Sat', 'Rest or an easy outdoor walk', 'Skip, or walk 20 minutes'], ['Sun', 'Rest', 'Rest']]),
    blk('heading_2', 'Day A — squat focus'),
    blk('heading_3', '30 minutes'),
    table([['Exercise', 'Sets × reps', 'Note'], ['Goblet squat', '2 × 8–12', 'Bodyweight squat if dumbbells are taken'], ['Dumbbell or cable row', '2 × 8–12', 'Superset with the press below'],
      ['Dumbbell floor or bench press', '2 × 8–12', 'Push-ups if you prefer'], ['Reverse lunge', '2 × 8–10 / leg', 'Hold dumbbells at your sides'], ['Dumbbell or cable shoulder press', '2 × 8–12', 'Superset with the lunge']]),
    blk('heading_3', '45–60 minutes'),
    table([['Exercise', 'Sets × reps', 'Note'], ['Goblet squat', '3 × 8–12', 'Heels down, chest up'], ['Dumbbell or cable row', '3 × 8–12', 'Pause briefly at the squeeze'],
      ['Dumbbell floor or bench press', '3 × 8–12', 'Push-ups are a fine swap'], ['Reverse lunge', '3 × 8–10 / leg', 'Hold dumbbells at your sides'],
      ['Dumbbell or cable shoulder press', '3 × 8–12', 'Stop just short of pain'], ['Cable face pull', '3 × 12–15', 'Light load'], ['Plank', '3 × 20–45 sec', 'Drop to knees if the back sags']]),
    blk('heading_2', 'Day B — hinge focus'),
    blk('heading_3', '45–60 minutes'),
    table([['Exercise', 'Sets × reps', 'Note'], ['Dumbbell Romanian deadlift', '3 × 8–12', 'Soft knees'], ['Push-ups or dumbbell press', '3 × 8–12', ''],
      ['Single-arm row', '3 × 8–12 / side', ''], ['Step-up or split squat', '3 × 8–10 / leg', ''], ['Dumbbell lateral raise', '3 × 10–15', '']]),
    blk('heading_2', 'Day C — split stance and core'),
    blk('heading_3', '45–60 minutes'),
    table([['Exercise', 'Sets × reps', 'Note'], ['Dumbbell split squat', '3 × 8–10 / leg', ''], ['Cable or dumbbell row', '3 × 8–12', ''],
      ['Dumbbell shoulder press', '3 × 8–12', ''], ['Glute bridge or hip thrust', '3 × 10–15', ''], ['Pallof press or cable chop', '3 × 8–12 / side', '']]),
    blk('heading_2', 'Cardio and incline walks'),
    blk('paragraph', 'Incline walking on the treadmill is the default. Start at a 4–8% incline.'),
  ];
}

function simplePage(title, lines) {
  return [blk('heading_2', title), ...lines.map((l) => blk('bulleted_list_item', l))];
}

export function createMockClient() {
  const pages = {};
  const dbRows = {};
  for (const p of Object.values(PEOPLE)) {
    pages[p.pages.routine] = routineBlocks();
    pages[p.pages.overview] = simplePage(`${p.name} — profile (demo data)`, ['Demo mode: connect a Notion token to see the real page.']);
    pages[p.pages.diet] = simplePage('Diet plan (demo data)', ['Breakfast about 8am', 'Lunch about 12:00', 'Dinner about 19:00']);
    for (const db of Object.values(p.dbs)) dbRows[db] = [];
  }
  seedHistory(dbRows, PEOPLE.amir, 20);
  seedHistory(dbRows, PEOPLE.rozhin, 10);

  const findPage = (id) => {
    for (const [db, rows] of Object.entries(dbRows)) {
      const row = rows.find((r) => r.id === id);
      if (row) return { db, row, rows };
    }
    return null;
  };

  return {
    async listChildren(id) {
      if (pages[id]) return structuredClone(pages[id]).map(({ children, ...b }) => b);
      const found = findBlock(Object.values(pages).flat(), id);
      return found?.children ? structuredClone(found.children).map(({ children, ...b }) => b) : [];
    },
    async queryDatabase(db, body = {}) {
      const rows = (dbRows[db] || []).filter((r) => !r.archived);
      const dir = body.sorts?.[0]?.direction === 'descending' ? -1 : 1;
      return [...rows].sort((a, b) => dir * a.properties.Date.date.start.localeCompare(b.properties.Date.date.start));
    },
    async createPage(db, properties) {
      const page = toPage(db, properties);
      (dbRows[db] ||= []).push(page);
      return page;
    },
    async retrievePage(id) {
      const hit = findPage(id);
      if (!hit) throw Object.assign(new Error('Not found'), { status: 404, code: 'object_not_found' });
      return hit.row;
    },
    async archivePage(id) {
      const hit = findPage(id);
      if (hit) hit.row.archived = true;
      return hit?.row;
    },
  };
}

function findBlock(list, id) {
  for (const b of list) {
    if (b.id === id) return b;
    const hit = b.children && findBlock(b.children, id);
    if (hit) return hit;
  }
  return null;
}

// Turn write-shaped properties into read-shaped ones (roughly what Notion returns).
function toPage(db, properties) {
  const props = {};
  for (const [k, v] of Object.entries(properties)) {
    if (v.title) props[k] = { title: v.title.map((t) => ({ plain_text: t.text.content })) };
    else if (v.rich_text) props[k] = { rich_text: v.rich_text.map((t) => ({ plain_text: t.text.content })) };
    else props[k] = v;
  }
  const id = `mock-page-${++seq}`;
  return { id, url: `https://www.notion.so/${id}`, parent: { database_id: db }, created_time: new Date().toISOString(), properties: props };
}

function seedHistory(dbRows, person, baseWeight) {
  const today = new Date();
  const day = (offset) => new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);
  const plan = [
    ['Strength A', ['Goblet squat', 'Dumbbell or cable row', 'Dumbbell floor or bench press']],
    ['Strength B', ['Dumbbell Romanian deadlift', 'Single-arm row', 'Dumbbell lateral raise']],
    ['Strength C', ['Dumbbell split squat', 'Cable or dumbbell row', 'Dumbbell shoulder press']],
  ];
  let n = 0;
  for (let off = 27; off >= 1; off--) {
    const dow = new Date(today.getTime() - off * 86400000).getDay();
    if (![1, 3, 5].includes(dow)) continue;
    const [session, exs] = plan[n % 3];
    const bump = Math.floor(n / 3) * 2.5;
    const text = exs.map((e, i) => {
      const w = baseWeight - i * 4 + bump;
      return `${e}: ${w}kg×10, ${w}kg×10, ${w}kg×${8 + (n % 3)}`;
    }).join('\n');
    dbRows[person.dbs.workouts].push(toPage(person.dbs.workouts, {
      Session: { title: [{ text: { content: session } }] },
      Date: { date: { start: day(off) } },
      'Exercises & sets/reps/weights': { rich_text: [{ text: { content: text } }] },
      Cardio: { rich_text: [] }, Notes: { rich_text: [] },
      'Duration min': { number: 45 }, 'Energy/RPE': { number: 7 },
      'Routine Block': { select: { name: 'Block 1' } },
    }));
    n++;
  }
  const start = person.id === 'amir' ? 89 : 70;
  for (let off = 27, i = 0; off >= 0; off -= 3, i++) {
    dbRows[person.dbs.weighins].push(toPage(person.dbs.weighins, {
      Name: { title: [{ text: { content: 'Weigh-in' } }] },
      Date: { date: { start: day(off) } },
      'Weight kg': { number: Math.round((start - i * 0.12 + ((i * 7) % 5) * 0.1) * 10) / 10 },
      'Waist cm': { number: i % 2 ? null : (person.id === 'amir' ? 98 : 80) - i * 0.2 },
      Notes: { rich_text: [] },
    }));
  }
}
