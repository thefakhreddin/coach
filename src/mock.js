// In-memory stand-in for Notion, used by `npm run demo` and the tests.
// The routine mirrors the real "Current Routine" page structure (Block 1).
import { PEOPLE, SHARED } from './config.js';

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

const A = (t) => t; // readability helper for the meal tables below
function mealsPage() {
  const hdr = ['Time', 'Amir', 'Rozhin'];
  const yog = '3/4 cup Greek yogurt (140 kcal / 20 g)';
  const rLunchAdd = ' + 2 eggs + 1 slice toast + tomato and cucumber';
  return [
    blk('paragraph', 'Same meals for both of you; only the portions differ. Shop and prep on Sunday and Wednesday.'),
    blk('heading_2', 'Every day'),
    table([hdr,
      ['Breakfast, about 8am', '3 eggs + 1 slice toast + 3/4 cup Greek yogurt + tomato and cucumber (460 kcal / 40 g)', 'Fasting until 12:00 (black coffee, tea, or water)'],
      ['Snack, about 10:30am', yog, 'Fasting until 12:00'],
      ['Snack, about 15:30 (Rozhin) / 4pm (Amir)', '1/2 cup Greek yogurt + cucumber + 1 apple (190 kcal / 10 g)', '1 cup Greek yogurt + cucumber + 1 apple (290 kcal / 25 g)'],
      ['Snack, before 20:00', '—', yog]]),
    blk('heading_2', 'Cycle A (Sun–Tue)'),
    table([hdr,
      ['Sun lunch', '1 can tuna + 1/2 cup Greek yogurt + 1 cup cooked rice + big salad + 1 tbsp oil (580 kcal / 45 g)', A('1 can tuna + 1/4 cup Greek yogurt + 3/4 cup cooked rice + big salad + 2 tsp oil' + rLunchAdd + ' (690 kcal / 50 g)')],
      ['Sun dinner', '140 g cooked lean ground beef (koobideh-style) + 1 cup cooked rice + half plate vegetables + 2 tsp oil (620 kcal / 40 g)', '120 g cooked lean ground beef (koobideh-style) + 3/4 cup cooked rice + half plate vegetables + 2 tsp oil (500 kcal / 30 g)'],
      ['Mon lunch', '150 g cooked lean ground beef (koobideh-style) + 3/4 cup cooked rice + big salad + 2 tsp oil (560 kcal / 45 g)', '110 g cooked lean ground beef (koobideh-style) + 2/3 cup cooked rice + big salad + 2 tsp oil' + rLunchAdd + ' (710 kcal / 45 g)'],
      ['Mon dinner', '1.5 cups cooked lentils + 1 egg + 1/4 cup Greek yogurt + salad + 2 tsp oil (570 kcal / 40 g)', '1 cup cooked lentils + 1 egg + 1/4 cup Greek yogurt + salad + 1 tsp oil (420 kcal / 30 g)'],
      ['Tue lunch', '1.5 cups cooked lentils + 1 egg + 1/4 cup Greek yogurt + salad + 2 tsp oil (570 kcal / 40 g)', '1 cup cooked lentils + 1 egg + 1/4 cup Greek yogurt + salad + 1 tsp oil' + rLunchAdd + ' (670 kcal / 45 g)'],
      ['Tue dinner', '140 g cooked lean ground beef (koobideh-style) + 1 cup cooked rice + half plate vegetables + 2 tsp oil (620 kcal / 40 g)', '120 g cooked lean ground beef (koobideh-style) + 3/4 cup cooked rice + half plate vegetables + 2 tsp oil (500 kcal / 30 g)']]),
    blk('heading_2', 'Cycle B (Wed–Sat)'),
    table([hdr,
      ['Wed lunch', '130 g cooked chicken + 1 cup cooked rice + big salad + 1 tbsp oil (570 kcal / 45 g)', '100 g cooked chicken + 3/4 cup cooked rice + big salad + 2 tsp oil' + rLunchAdd + ' (680 kcal / 50 g)'],
      ['Wed dinner', '150 g cooked stew beef + 1 cup cooked rice + half plate vegetables + 1 tbsp oil (630 kcal / 45 g)', '120 g cooked stew beef + 3/4 cup cooked rice + half plate vegetables + 2 tsp oil (480 kcal / 35 g)'],
      ['Thu lunch', '150 g cooked stew beef + 1 cup cooked rice + big salad + 1 tbsp oil (610 kcal / 45 g)', '110 g cooked stew beef + 2/3 cup cooked rice + big salad + 2 tsp oil' + rLunchAdd + ' (680 kcal / 50 g)'],
      ['Thu dinner', '120 g cooked chicken + 1 cup cooked rice + half plate vegetables + 1 tbsp oil (570 kcal / 40 g)', '90 g cooked chicken + 3/4 cup cooked rice + half plate vegetables + 2 tsp oil (430 kcal / 30 g)'],
      ['Fri lunch', '1 can tuna + 1/2 cup Greek yogurt + 1 cup cooked rice + big salad + 1 tbsp oil (580 kcal / 45 g)', '1 can tuna + 1/4 cup Greek yogurt + 3/4 cup cooked rice + big salad + 2 tsp oil' + rLunchAdd + ' (690 kcal / 50 g)'],
      ['Fri dinner', '120 g cooked chicken + 1 cup cooked rice + half plate vegetables + 1 tbsp oil (570 kcal / 40 g)', '90 g cooked chicken + 3/4 cup cooked rice + half plate vegetables + 2 tsp oil (430 kcal / 30 g)'],
      ['Sat lunch', '150 g cooked stew beef + 1 cup cooked rice + big salad + 1 tbsp oil (610 kcal / 45 g)', '110 g cooked stew beef + 2/3 cup cooked rice + big salad + 2 tsp oil' + rLunchAdd + ' (680 kcal / 50 g)'],
      ['Sat dinner', '150 g cooked stew beef (or lamb) + 1 cup cooked rice + half plate vegetables + 1 tbsp oil (630 kcal / 45 g)', '120 g cooked stew beef (or lamb) + 3/4 cup cooked rice + half plate vegetables + 2 tsp oil (480 kcal / 35 g)']]),
    blk('heading_2', 'Meal prep'),
    blk('paragraph', 'Cook eggs fresh. Dress salads only when you eat. Cooked beef, chicken, lentils, and rice keep 3–4 days in the fridge.'),
    table([['Day', 'Step', 'Time'],
      ['Sunday (Cycle A)', 'Shop for Sun–Tue', 'Before prep'],
      ['Sunday (Cycle A)', 'Cook koobideh-style lean ground beef', '20–25 min'],
      ['Sunday (Cycle A)', 'Cook one pot of lentils', '25–30 min'],
      ['Sunday (Cycle A)', 'Cook one pot of rice and portion it', '20 min'],
      ['Sunday (Cycle A)', 'Chop salad, cucumber, and vegetables; portion yogurt; wash apples', '15 min'],
      ['Sunday (Cycle A)', 'Pack lunches and dinners', '10 min'],
      ['Sunday total', 'Covers Sun–Tue', 'About 60–90 min'],
      ['Wednesday (Cycle B)', 'Shop for Wed–Sat', 'Before prep'],
      ['Wednesday (Cycle B)', 'Bake chicken (lemon, garlic, salt, turmeric)', '40–50 min'],
      ['Wednesday (Cycle B)', 'Cook stew beef (onion, tomato, turmeric)', '15 min + simmer'],
      ['Wednesday (Cycle B)', 'Cook rice; chop vegetables; portion yogurt; wash apples', '20 min'],
      ['Wednesday (Cycle B)', 'Pack lunches and dinners', '10 min']]),
  ];
}

function profilePage(p) {
  const amir = p.id === 'amir';
  return [blk('heading_2', 'Profile & targets'), { ...table([['', ''], ['Age', '27'], ['Height', amir ? '176 cm' : '164 cm'], ['Starting weight', amir ? 'about 89 kg' : '70 kg'],
    ['Daily energy', amir ? '2,000 kcal' : '1,600 kcal'], ['Protein', amir ? '150 g' : '120 g']]), table: { has_column_header: false } }];
}

function simplePage(title, lines) {
  return [blk('heading_2', title), ...lines.map((l) => blk('bulleted_list_item', l))];
}

export function createMockClient() {
  const pages = {};
  const dbRows = {};
  for (const p of Object.values(PEOPLE)) {
    pages[p.pages.routine] = routineBlocks();
    pages[p.pages.overview] = profilePage(p);
    pages[p.pages.diet] = simplePage('Diet plan (demo data)', ['Breakfast about 8am', 'Lunch about 12:00', 'Dinner about 19:00']);
    for (const db of Object.values(p.dbs)) dbRows[db] = [];
  }
  pages[SHARED.meals] = mealsPage();
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
    async updatePage(id, properties) {
      const hit = findPage(id);
      if (!hit) throw Object.assign(new Error('Not found'), { status: 404, code: 'object_not_found' });
      Object.assign(hit.row.properties, toPage(hit.db, properties).properties);
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
