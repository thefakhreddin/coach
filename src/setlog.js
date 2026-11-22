// Exercise Plan (read) and Set Log (write) databases that Coach maintains in Notion.
import { plain } from './notion.js';

const prop = (page, name) => page.properties?.[name];
const text = (p) => (p ? plain(p.rich_text || p.title || []) : '');
const num = (p) => (p?.number ?? null);
const sel = (p) => p?.select?.name ?? null;

// "8-12", "10-15 / side", "30 sec / side", "5-8 min", "30 min, 4-8% incline" -> lowest number
export function lowOfRange(range) {
  const m = String(range || '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function planRowFromPage(page) {
  const unit = sel(prop(page, 'Unit')) || 'reps';
  const recW = num(prop(page, 'Recommended Weight (kg)'));
  const recR = num(prop(page, 'Recommended Reps'));
  const sets = num(prop(page, 'Sets'));
  const range = text(prop(page, 'Rep Range'));
  const u = unit === 'reps' ? '' : ` ${unit}`;
  const recommended = recW != null || recR != null
    ? `${recW != null ? `${recW} kg` : ''}${recW != null && recR != null ? ' × ' : ''}${recR != null ? (recW == null && unit === 'reps' ? `× ${recR}` : `${recR}${u}`) : ''}`
    : '';
  return {
    planId: page.id,
    name: text(prop(page, 'Exercise')),
    day: sel(prop(page, 'Day')),
    session: text(prop(page, 'Session')),
    order: num(prop(page, 'Order')) ?? 999,
    type: sel(prop(page, 'Type')),
    unit,
    sets: sets || 1,
    range,
    target: `${sets || 1} × ${range.replace(/(\d)-(\d)/g, '$1–$2')}`,
    repsLow: lowOfRange(range),
    timed: unit === 'reps' ? false : unit,
    in30: !!prop(page, 'In 30-min Version')?.checkbox,
    block: sel(prop(page, 'Block')),
    note: text(prop(page, 'Coach Note')),
    recommended,
    // One entry, repeated for every set by the app. Seconds for timed work (minutes * 60).
    rec: recW != null || recR != null
      ? [{ weight: recW, reps: unit === 'reps' ? recR : null, seconds: unit === 'reps' || recR == null ? null : recR * (unit === 'min' ? 60 : 1) }]
      : [],
  };
}

// Group plan rows into the same shape the app uses for routine pages.
export function planFromRows(pages) {
  const rows = pages.map(planRowFromPage).filter((r) => r.name && r.day).sort((a, b) => a.order - b.order);
  const days = {};
  for (const r of rows) {
    const d = (days[r.day] ||= { letter: r.day, title: r.session || r.day, versions: { '30 minutes': [], '45–60 minutes': [] } });
    d.versions['45–60 minutes'].push(r);
    if (r.in30) d.versions['30 minutes'].push(r);
  }
  for (const d of Object.values(days)) if (!d.versions['30 minutes'].length) delete d.versions['30 minutes'];
  return { days, block: rows[0]?.block || null, count: rows.length };
}

export function setFromPage(page) {
  return {
    id: page.id,
    date: prop(page, 'Date')?.date?.start?.slice(0, 10) || null,
    sessionId: text(prop(page, 'Session ID')),
    exercise: text(prop(page, 'Exercise')),
    planId: prop(page, 'Plan Exercise')?.relation?.[0]?.id || null,
    day: sel(prop(page, 'Day')),
    set: num(prop(page, 'Set')),
    weight: num(prop(page, 'Weight (kg)')),
    reps: num(prop(page, 'Reps')),
    unit: sel(prop(page, 'Unit')) || 'reps',
    completed: !!prop(page, 'Completed')?.checkbox,
    source: sel(prop(page, 'Source')),
  };
}

const DAYS = ['A', 'B', 'C', 'D', 'Cardio', 'Other'];
const n = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const rt = (s) => ({ rich_text: s ? [{ text: { content: String(s).slice(0, 1900) } }] : [] });

export function setLogProps(person, session, it) {
  const unit = ['reps', 'sec', 'min'].includes(it.unit) ? it.unit : 'reps';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(session.date) ? session.date : new Date().toISOString().slice(0, 10);
  const day = DAYS.includes(it.day || session.day) ? (it.day || session.day) : 'Other';
  const props = {
    Entry: { title: [{ text: { content: `${date} ${person.name} ${it.exercise} set ${it.set}`.slice(0, 1900) } }] },
    Date: { date: { start: date } },
    Person: { select: { name: person.name } },
    Exercise: rt(it.exercise),
    Day: { select: { name: day } },
    Set: { number: n(it.set) },
    'Weight (kg)': { number: n(it.weight) || null },
    Reps: { number: n(it.reps) },
    Unit: { select: { name: unit } },
    'Recommended Weight (kg)': { number: n(it.recW) },
    'Recommended Reps': { number: n(it.recR) },
    Completed: { checkbox: !!it.completed },
    Source: { select: { name: 'App' } },
    'Session ID': rt(session.sessionId),
    'Plan Exercise': { relation: it.planId ? [{ id: it.planId }] : [] },
  };
  if (n(it.rpe) != null) props.RPE = { number: n(it.rpe) };
  if (it.notes) props.Notes = rt(it.notes);
  return props;
}
