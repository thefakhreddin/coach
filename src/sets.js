// Read and write the "Exercises & sets/reps/weights" text field.
//
// One exercise per line, sets separated by commas:
//   Goblet squat: 20kg×10, 20kg×10, 22.5kg×8
//   Push-ups: BW×12, BW×10
//   Plank: 30s, 40s
// This stays readable for people and for Coach in Notion, and the app can
// parse it back for progress charts. Hand-written variants like "20x10",
// "20 kg x 10", "3x10 @ 20kg" and "10 reps" are understood too.

const NUM = '(\\d+(?:[.,]\\d+)?)';

export function formatSet(s) {
  if (s.seconds != null && !s.reps) {
    const sec = Number(s.seconds);
    return sec >= 60 && sec % 60 === 0 ? `${trim(sec / 60)}min` : `${trim(sec)}s`;
  }
  const reps = s.reps != null ? trim(s.reps) : '?';
  if (s.weight == null || s.weight === '' || Number(s.weight) === 0) return `BW×${reps}`;
  return `${trim(s.weight)}kg×${reps}`;
}

export function formatExercises(exercises) {
  return exercises
    .map((ex) => ({ ...ex, sets: (ex.sets || []).filter(isFilledSet) }))
    .filter((ex) => ex.name && ex.sets.length)
    .map((ex) => `${ex.name.replace(/[:\n]/g, ' ').trim()}: ${ex.sets.map(formatSet).join(', ')}`)
    .join('\n');
}

function isFilledSet(s) {
  return (s.reps != null && s.reps !== '' && Number(s.reps) > 0) ||
    (s.seconds != null && s.seconds !== '' && Number(s.seconds) > 0);
}

function trim(n) {
  const v = Number(n);
  return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : String(n);
}

function num(s) {
  return Number(String(s).replace(',', '.'));
}

export function parseSet(raw) {
  const t = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  let m;
  // "3x10 @ 20kg"  -> three sets of 10 at 20 kg
  if ((m = t.match(new RegExp(`^(\\d+) ?[x×*] ?(\\d+) ?@ ?${NUM} ?(kg|lbs?)?$`)))) {
    const w = toKg(num(m[3]), m[4]);
    return Array.from({ length: Number(m[1]) }, () => ({ weight: w, reps: Number(m[2]) }));
  }
  // "20kg×10", "20 x 10", "bw×12", "bodyweight x 12"
  if ((m = t.match(new RegExp(`^(?:${NUM} ?(kg|lbs?)?|bw|bodyweight) ?[x×*] ?(\\d+)(?: ?reps?)?$`)))) {
    return [{ weight: m[1] ? toKg(num(m[1]), m[2]) : null, reps: Number(m[3]) }];
  }
  // "30s", "45 sec"
  if ((m = t.match(new RegExp(`^${NUM} ?(s|sec|secs|seconds)$`)))) {
    return [{ weight: null, reps: null, seconds: num(m[1]) }];
  }
  // "8min", "10 minutes"
  if ((m = t.match(new RegExp(`^${NUM} ?(min|mins|minutes?)$`)))) {
    return [{ weight: null, reps: null, seconds: num(m[1]) * 60 }];
  }
  // "12" or "12 reps"
  if ((m = t.match(/^(\d+)(?: ?reps?)?$/))) return [{ weight: null, reps: Number(m[1]) }];
  return null;
}

function toKg(w, unit) {
  return unit && unit.startsWith('lb') ? Math.round(w * 0.4536 * 10) / 10 : w;
}

export function parseExercises(text) {
  if (!text) return [];
  const out = [];
  for (const line of String(text).split(/\n|;/)) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const name = line.slice(0, idx).replace(/^[-•*\s]+/, '').trim();
    const sets = [];
    for (const part of line.slice(idx + 1).split(',')) {
      const parsed = parseSet(part);
      if (parsed) sets.push(...parsed);
    }
    if (name && sets.length) out.push({ name, sets });
  }
  return out;
}

// Normalise exercise names so "Goblet Squat" and "goblet squat " group together.
export function exerciseKey(name) {
  return String(name).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Coach's "Recommended" cell -> one entry per set (weight in kg, reps or seconds).
// Understands: "12 kg × 10", "12 kg × 10, 10, 8", "12×10, 14×8", "12 kg" (weight only),
// "× 12" / "12 reps" (bodyweight), "40 sec", "8 min", "25 lb × 10".
export function parseRecommendation(text) {
  const out = [];
  let lastWeight = null;
  for (const raw of String(text || '').split(/,|;|\n/)) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^[x×*] ?/, '');
    if (!t || t === '—' || t === '-') continue;
    let m;
    const parsed = parseSet(t);
    if (parsed) {
      for (const p of parsed) {
        if (p.weight != null) lastWeight = p.weight;
        else if (p.reps != null && lastWeight != null && !/^bw|bodyweight/.test(t)) p.weight = lastWeight;
        out.push(p);
      }
    } else if ((m = t.match(new RegExp(`^${NUM} ?(kg|lbs?)$`)))) {
      lastWeight = toKg(num(m[1]), m[2]);
      out.push({ weight: lastWeight, reps: null });
    }
  }
  return out;
}
