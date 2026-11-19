// Turn the "Shared Meals & Prep" page into structured meals with estimated macros.
//
// Meal cells look like:
//   "3 eggs + 1 slice toast + 3/4 cup Greek yogurt + tomato and cucumber (460 kcal / 40 g)"
// The kcal / protein in brackets come from Coach and are shown as-is. Carbs and fat are
// estimated from the small food table below (typical values for cooked foods).
import { plain } from './notion.js';

// Macros per base unit. Units: g = per gram, cup, tsp, each/serving.
export const FOODS = [
  { key: 'groundbeef', label: 'Lean ground beef (koobideh)', re: /ground beef|koobideh/i, unit: 'g', kcal: 2.2, p: 0.26, c: 0, f: 0.12 },
  { key: 'stewbeef', label: 'Stew beef', re: /stew beef/i, unit: 'g', kcal: 2.15, p: 0.30, c: 0, f: 0.10 },
  { key: 'lamb', label: 'Lamb', re: /\blamb\b/i, unit: 'g', kcal: 2.58, p: 0.26, c: 0, f: 0.17 },
  { key: 'chicken', label: 'Chicken', re: /chicken/i, unit: 'g', kcal: 1.65, p: 0.31, c: 0, f: 0.036 },
  { key: 'tuna', label: 'Tuna', re: /tuna/i, unit: 'can', kcal: 120, p: 26, c: 0, f: 1 },
  { key: 'lentils', label: 'Lentils (cooked)', re: /lentil/i, unit: 'cup', kcal: 230, p: 18, c: 40, f: 0.8 },
  { key: 'rice', label: 'Rice (cooked)', re: /rice/i, unit: 'cup', kcal: 205, p: 4.3, c: 45, f: 0.4 },
  { key: 'yogurt', label: 'Greek yogurt', re: /yogh?urt/i, unit: 'cup', kcal: 184, p: 26.7, c: 8, f: 5 },
  { key: 'toast', label: 'Toast', re: /toast|bread/i, unit: 'slice', kcal: 80, p: 3, c: 14, f: 1 },
  { key: 'egg', label: 'Eggs', re: /\beggs?\b/i, unit: 'each', kcal: 72, p: 6.3, c: 0.4, f: 4.8 },
  { key: 'apple', label: 'Apple', re: /apple/i, unit: 'each', kcal: 95, p: 0.5, c: 25, f: 0.3 },
  { key: 'tomcuc', label: 'Tomato & cucumber', re: /tomato and cucumber/i, unit: 'each', kcal: 30, p: 1.3, c: 6, f: 0.3 },
  { key: 'cucumber', label: 'Cucumber', re: /cucumber/i, unit: 'each', kcal: 16, p: 0.7, c: 3.5, f: 0.1 },
  { key: 'bigsalad', label: 'Big salad', re: /big salad/i, unit: 'each', kcal: 45, p: 2, c: 9, f: 0.4 },
  { key: 'salad', label: 'Salad', re: /salad/i, unit: 'each', kcal: 25, p: 1.2, c: 5, f: 0.2 },
  { key: 'veg', label: 'Vegetables', re: /vegetable/i, unit: 'plate', kcal: 100, p: 5, c: 20, f: 0.6 },
  { key: 'oil', label: 'Oil', re: /\boil\b/i, unit: 'tsp', kcal: 40, p: 0, c: 0, f: 4.5 },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseQty(s) {
  if (!s) return null;
  if (/^half$/i.test(s)) return 0.5;
  if (/^\d+\/\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); return a / b; }
  return Number(s);
}

// "140 g cooked lean ground beef (koobideh-style)" -> { food, qty, unit }
export function parseItem(raw) {
  const text = raw.replace(/\(or [^)]*\)/gi, '').trim();
  const m = text.match(/^(\d+\/\d+|\d+(?:\.\d+)?|half)?\s*(g|grams?|cups?|tbsp|tsp|slices?|cans?|plates?)?\b\s*(.*)$/i);
  const qty = parseQty(m?.[1]) ?? 1;
  let unit = (m?.[2] || '').toLowerCase().replace(/s$/, '').replace(/^gram$/, 'g');
  const name = (m?.[3] || text).trim();
  const food = FOODS.find((f) => f.re.test(name));
  if (!food) return { name: raw.trim(), qty, unit, food: null };
  let amount = qty;
  if (food.unit === 'tsp' && unit === 'tbsp') amount = qty * 3;
  return { name: raw.trim(), food: food.key, label: food.label, amount: round(amount, 2), unit: food.unit,
    macros: { kcal: food.kcal * amount, p: food.p * amount, c: food.c * amount, f: food.f * amount } };
}

const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

export function parseMealCell(cellText) {
  const t = String(cellText || '').trim();
  if (!t || t === '—' || t === '-') return null;
  if (/^fasting/i.test(t)) return { fasting: true, text: t.replace(/\s*\(.*\)$/, '') };
  let kcal = null, protein = null;
  let body = t;
  const m = t.match(/\((\d[\d,]*)\s*kcal\s*\/\s*(\d+)\s*g\)\s*$/i);
  if (m) { kcal = Number(m[1].replace(',', '')); protein = Number(m[2]); body = t.slice(0, m.index).trim(); }
  const items = body.split(/\s+\+\s+/).map(parseItem);
  const est = items.reduce((a, i) => (i.macros ? { kcal: a.kcal + i.macros.kcal, p: a.p + i.macros.p, c: a.c + i.macros.c, f: a.f + i.macros.f } : a), { kcal: 0, p: 0, c: 0, f: 0 });
  return {
    text: body,
    items,
    kcal: kcal ?? round(est.kcal),
    protein: protein ?? round(est.p),
    carbs: round(est.c),
    fat: round(est.f),
    estimated: { kcal: round(est.kcal), protein: round(est.p) },
  };
}

function toMinutes(str) {
  const m = String(str).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (m[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
  if (m[3]?.toLowerCase() === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

// Work out slot name, display time and sort order for one row label and one person.
export function slotInfo(label, personName) {
  const l = label.trim();
  const slot = (l.match(/breakfast|lunch|dinner|snack/i)?.[0] || 'Meal').replace(/^./, (c) => c.toUpperCase());
  // Person-specific times: "about 15:30 (Rozhin) / 4pm (Amir)"
  let time = null;
  const own = l.match(new RegExp(`(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)\\s*\\(${personName}\\)`, 'i'));
  if (own) time = own[1];
  else if (!/\([A-Z][a-z]+\)/.test(l)) {
    const t = l.match(/(?:about|before|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (t) time = t[1];
  }
  let minutes = time ? toMinutes(time) : null;
  if (minutes != null && /before/i.test(l)) minutes -= 15;
  if (minutes == null) minutes = { Breakfast: 8 * 60, Lunch: 12 * 60 + 30, Snack: 15 * 60, Dinner: 19 * 60, Meal: 12 * 60 }[slot];
  const display = time ? (/before/i.test(l) ? `before ${time}` : time) : { Lunch: 'midday', Dinner: 'evening' }[slot] || '';
  return { slot, time: display, minutes };
}

// blocks: simplified blocks of the Shared Meals & Prep page. people: [{id, name}]
export function parseMealsPage(blocks, people) {
  const out = { people: {}, prep: [], notes: [] };
  for (const p of people) out.people[p.id] = { everyday: [], days: Object.fromEntries(DAYS.map((d) => [d, []])) };
  let heading = '';

  const visit = (list) => {
    for (const b of list) {
      const text = b.text ? plain(b.text).trim() : '';
      if (/^heading/.test(b.type)) heading = text;
      if (b.type === 'table' && b.rows?.length > 1) {
        const rows = b.rows.map((r) => r.map((c) => plain(c).trim()));
        const header = rows[0].map((h) => h.toLowerCase());
        const personCols = people.map((p) => ({ p, i: header.findIndex((h) => h === p.name.toLowerCase()) })).filter((x) => x.i > 0);
        if (personCols.length) {
          for (const r of rows.slice(1)) {
            const label = r[0];
            const day = DAYS.find((d) => new RegExp(`^${d}\\b`, 'i').test(label));
            for (const { p, i } of personCols) {
              const meal = parseMealCell(r[i]);
              if (!meal) continue;
              const info = slotInfo(label, p.name);
              const entry = { ...info, label, ...meal };
              if (day) out.people[p.id].days[day].push(entry);
              else out.people[p.id].everyday.push(entry);
            }
          }
        } else if (header[0] === 'day' && header.some((h) => h.includes('step'))) {
          for (const r of rows.slice(1)) {
            const dayIdx = DAY_FULL.findIndex((d) => r[0].toLowerCase().startsWith(d.toLowerCase()));
            if (dayIdx < 0 || /total/i.test(r[0])) continue;
            out.prep.push({ day: DAYS[dayIdx], step: r[1], time: r[2] || '' });
          }
        }
      } else if (b.type === 'paragraph' && /meal prep/i.test(heading) && text) {
        out.notes.push(text);
      }
      if (b.children && b.type !== 'table') visit(b.children);
    }
  };
  visit(blocks);
  return out;
}

// Pull "Daily energy" and "Protein" targets from a person's profile table.
export function parseTargets(blocks) {
  const targets = {};
  const visit = (list) => {
    for (const b of list) {
      if (b.type === 'table') {
        for (const r of b.rows || []) {
          const [k, v] = r.map((c) => plain(c).trim());
          const n = Number(String(v || '').replace(/,/g, '').match(/\d+(\.\d+)?/)?.[0]);
          if (!Number.isFinite(n)) continue;
          if (/^daily energy/i.test(k)) targets.kcal = n;
          else if (/^protein$/i.test(k)) targets.protein = n;
          else if (/^starting weight/i.test(k)) targets.startWeight = n;
          else if (/^height/i.test(k)) targets.height = n;
        }
      }
      if (b.children) visit(b.children);
    }
  };
  visit(blocks);
  return targets;
}
