import { lineChart, barChart, donutChart } from './charts.js';

// ================= helpers =================
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const isoOf = (d) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const todayISO = () => isoOf(new Date());
const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const parseDate = (s) => new Date(`${s}T12:00:00`);
const dayOf = (iso) => DAYS[parseDate(iso).getDay()];
const fmtDate = (s) => parseDate(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtLong = (s) => parseDate(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const exKey = (n) => String(n).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const fmtSet = (s) => (s.seconds && !s.reps ? `${s.seconds}s` : `${s.weight ? `${s.weight}kg` : 'BW'}×${s.reps}`);
const e1rm = (s) => (s.weight && s.reps ? s.weight * (1 + Math.min(s.reps, 15) / 30) : 0);
const r1 = (n) => Math.round(n * 10) / 10;
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const MACRO = [
  { k: 'protein', label: 'Protein', color: 'var(--series-1)', kcal: 4 },
  { k: 'carbs', label: 'Carbs', color: 'var(--series-2)', kcal: 4 },
  { k: 'fat', label: 'Fat', color: 'var(--series-3)', kcal: 9 },
];

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('No connection'), { offline: true });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== 'login') { showLogin(); throw new Error('Please sign in'); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem(k),
};

// ================= state & data =================
const state = {
  people: [],
  person: localStorage.getItem('person') || 'amir',
  tab: localStorage.getItem('tab2') || 'today',
  kitchenDay: 0,
  cache: {},
  meals: null,
};
const pc = () => (state.cache[state.person] ||= {});
const personName = (id = state.person) => state.people.find((p) => p.id === id)?.name || id;

async function load(kind, { fresh = false } = {}) {
  const c = pc();
  if (!fresh && c[kind]) return c[kind];
  c[kind] = await api(`people/${state.person}/${kind}${fresh && ['routine', 'profile'].includes(kind) ? '?fresh=1' : ''}`);
  return c[kind];
}
async function loadMeals({ fresh = false } = {}) {
  if (!fresh && state.meals) return state.meals;
  state.meals = await api(`meals${fresh ? '?fresh=1' : ''}`);
  return state.meals;
}

function mealsFor(personId, iso) {
  const plan = state.meals?.people?.[personId];
  if (!plan) return [];
  return [...plan.everyday, ...(plan.days[dayOf(iso)] || [])].sort((a, b) => a.minutes - b.minutes);
}
function dayTotals(meals) {
  return meals.filter((m) => !m.fasting).reduce((a, m) => ({
    kcal: a.kcal + (m.kcal || 0), protein: a.protein + (m.protein || 0), carbs: a.carbs + (m.carbs || 0), fat: a.fat + (m.fat || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}
const itemText = (it) => it.name.replace(/\s*\([^)]*\)/g, '').replace(/\bcooked\s+/i, '');
const shortMeal = (m) => (m.fasting ? 'Fasting' : m.items.filter((i) => i.food && i.food !== 'oil').slice(0, 3).map((i) => i.label.replace(/ \(.*\)/, '')).join(' · '));

function plannedFor(routine, iso) {
  const entry = routine.schedule.find((s) => s.day === dayOf(iso));
  if (!entry) return { kind: 'other', label: 'Workout' };
  const m = entry.session.match(/(?:Strength|Day)\s+([A-Z])\b/i);
  if (m && routine.days[m[1].toUpperCase()]) return { kind: 'strength', letter: m[1].toUpperCase(), label: entry.session };
  if (/^rest/i.test(entry.session)) return { kind: 'rest', label: entry.session };
  if (/walk|cardio|bike/i.test(entry.session)) return { kind: 'cardio', label: entry.session };
  return { kind: 'other', label: entry.session };
}
function defaultVersion(routine, letter) {
  const vs = Object.keys(routine.days[letter]?.versions || {});
  const saved = localStorage.getItem('version');
  if (saved && vs.includes(saved)) return saved;
  return vs.find((v) => /45|60/.test(v)) || vs[vs.length - 1] || null;
}
function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const volumeOf = (w) => w.exercises.reduce((sum, ex) => sum + ex.sets.reduce((s, x) => s + (x.weight || 0) * (x.reps || 0), 0), 0);

// ================= auto-save to Notion =================
// Each entry (today's workout, today's weigh-in) lives in localStorage first, then is pushed to
// Notion a moment after you stop typing. Offline? It retries until it gets through.
const saver = { timers: {}, busy: {}, again: {} };
const PENDING = 'pending-saves';

function markPending(key, on) {
  const set = new Set(store.get(PENDING) || []);
  on ? set.add(key) : set.delete(key);
  store.set(PENDING, [...set]);
}
function setStatus(key, status) {
  saver.status = { ...(saver.status || {}), [key]: status };
  const el = document.querySelector(`[data-status="${CSS.escape(key)}"]`);
  if (!el) return;
  const text = { pending: 'Editing…', saving: 'Saving…', saved: 'Saved to Notion ✓', offline: 'Offline. Will sync when back online', error: 'Not saved. Retrying…', idle: '' }[status] || '';
  el.textContent = text;
  el.className = `status ${status}`;
}
function scheduleSave(key, delay = 1200) {
  markPending(key, true);
  setStatus(key, 'pending');
  clearTimeout(saver.timers[key]);
  saver.timers[key] = setTimeout(() => flush(key), delay);
}
async function flush(key) {
  clearTimeout(saver.timers[key]);
  if (saver.busy[key]) { saver.again[key] = true; return; }
  const entry = store.get(key);
  if (!entry) { markPending(key, false); return; }
  const spec = entry.type === 'weigh' ? weighSpec : gymSpec;
  const body = spec.body(entry);
  if (!body) { markPending(key, false); setStatus(key, 'idle'); return; }
  saver.busy[key] = true;
  setStatus(key, 'saving');
  try {
    const base = `people/${entry.person}/${spec.resource}`;
    const saved = entry.pageId
      ? await api(`${base}/${entry.pageId}`, { method: 'PATCH', body })
      : await api(base, { method: 'POST', body });
    const latest = store.get(key) || entry;
    latest.pageId = saved.id;
    store.set(key, latest);
    spec.onSaved(entry.person, saved);
    markPending(key, false);
    setStatus(key, 'saved');
  } catch (err) {
    setStatus(key, err.offline ? 'offline' : 'error');
    if (!err.offline) console.warn(err);
    clearTimeout(saver.timers[key]);
    saver.timers[key] = setTimeout(() => flush(key), 15000);
  } finally {
    saver.busy[key] = false;
    if (saver.again[key]) { saver.again[key] = false; flush(key); }
  }
}
const flushAll = () => (store.get(PENDING) || []).forEach((k) => flush(k));
window.addEventListener('online', flushAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });

function upsert(list, item, sortKey, desc) {
  const out = [...(list || []).filter((x) => x.id !== item.id), item];
  return out.sort((a, b) => (desc ? -1 : 1) * String(a[sortKey] || '').localeCompare(String(b[sortKey] || '')));
}
const weighSpec = {
  resource: 'weighins',
  body: (e) => (num(e.weight) == null && num(e.waist) == null ? null : { date: e.date, weight: num(e.weight), waist: num(e.waist) }),
  onSaved: (person, saved) => { const c = (state.cache[person] ||= {}); if (c.weighins) c.weighins = upsert(c.weighins, saved, 'date'); },
};
const gymSpec = {
  resource: 'workouts',
  body: (g) => {
    const exercises = g.exercises.map((ex) => ({
      name: ex.name,
      sets: ex.sets.filter((s) => num(s.reps) > 0 || num(s.seconds) > 0).map((s) => ({ weight: num(s.weight), reps: num(s.reps), seconds: num(s.seconds) })),
    })).filter((ex) => ex.sets.length);
    const c = g.cardio || {};
    const cardio = num(c.minutes) ? [g.choice.kind === 'cardio' ? (g.choice.label || 'Cardio') : 'Cardio', `${c.minutes} min`, num(c.incline) != null ? `${c.incline}% incline` : '', num(c.speed) != null ? `${c.speed} km/h` : ''].filter(Boolean).join(', ') : '';
    if (!exercises.length && !cardio && !g.notes?.trim() && !num(g.rpe)) return null;
    return { date: g.date, session: g.session, block: g.block, durationMin: num(g.durationMin) ?? (num(c.minutes) && !exercises.length ? num(c.minutes) : null), rpe: num(g.rpe), notes: g.notes || '', cardio, exercises };
  },
  onSaved: (person, saved) => { const c = (state.cache[person] ||= {}); if (c.workouts) c.workouts = upsert(c.workouts, saved, 'date', true); },
};

// ================= boot =================
function showLogin() {
  $('#main').hidden = true;
  $('#login').hidden = false;
  $('#password').focus();
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    await api('login', { method: 'POST', body: { password: $('#password').value } });
    $('#password').value = '';
    start();
  } catch (err) { $('#login-error').textContent = err.message; }
});

async function start() {
  try {
    const session = await api('session');
    state.people = await api('people');
    $('#login').hidden = true;
    $('#main').hidden = false;
    $('#banner').hidden = !session.mock;
    $('#banner').textContent = 'Demo mode: sample data, nothing is saved to Notion.';
    renderPeople();
    renderTabs();
    render();
    flushAll();
  } catch (err) {
    if (err.message !== 'Please sign in') { $('#main').hidden = false; $('#view').innerHTML = `<div class="card error">${esc(err.message)}</div>`; }
  }
}

function renderPeople() {
  $('#people').innerHTML = state.people.map((p) =>
    `<button role="tab" data-person="${p.id}" aria-selected="${p.id === state.person}">${p.emoji} ${esc(p.name)}</button>`).join('');
}
$('#people').addEventListener('click', (e) => {
  const b = e.target.closest('[data-person]');
  if (!b || b.dataset.person === state.person) return;
  flushAll();
  state.person = b.dataset.person;
  localStorage.setItem('person', state.person);
  renderPeople();
  render();
});
function renderTabs() {
  for (const b of document.querySelectorAll('#tabs button')) {
    if (b.dataset.tab === state.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}
function go(tab) {
  state.tab = tab;
  localStorage.setItem('tab2', tab);
  renderTabs();
  render();
  window.scrollTo(0, 0);
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });
$('#refresh').addEventListener('click', async () => {
  state.cache = {};
  try { await Promise.all([loadMeals({ fresh: true }), load('routine', { fresh: true }), load('profile', { fresh: true })]); } catch { /* shown below */ }
  render();
  toast('Reloaded from Notion');
});

let renderSeq = 0;
async function render() {
  const view = $('#view');
  const seq = ++renderSeq;
  view.onclick = null;
  view.oninput = null;
  view.onchange = null;
  view.onfocusout = null;
  view.innerHTML = '<div class="spinner">Loading…</div>';
  try {
    const fn = { today: renderToday, gym: renderGym, kitchen: renderKitchen, progress: renderProgress, week: renderWeek }[state.tab] || renderToday;
    await fn(view, () => seq === renderSeq);
  } catch (err) {
    if (seq === renderSeq) view.innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p></div>`;
  }
}

// ================= shared UI pieces =================
function nutritionCard(meals, targets) {
  const t = dayTotals(meals);
  const meter = (label, val, target, unit) => `<div class="meter"><div class="top"><span>${label}</span><span>${Math.round(val).toLocaleString()}${target ? ` / ${target.toLocaleString()}` : ''} ${unit}</span></div>
    <div class="track"><div class="fill" style="width:${target ? Math.min(100, (val / target) * 100) : 0}%"></div></div></div>`;
  return { totals: t, html: `<div class="nutri"><div data-donut="day"></div><div>
      ${meter('Calories', t.kcal, targets?.kcal, 'kcal')}
      ${meter('Protein', t.protein, targets?.protein, 'g')}
      <div class="macro-grid">${MACRO.map((m) => `<div><div class="v">${Math.round(t[m.k])}g</div><div class="k"><span class="swatch" style="background:${m.color}"></span>${m.label}</div></div>`).join('')}</div>
    </div></div>` };
}
function drawMacroDonut(el, t, opts = {}) {
  donutChart(el, MACRO.map((m) => ({ label: m.label, value: (t[m.k] || 0) * m.kcal, color: m.color, display: `${Math.round(t[m.k] || 0)} g` })),
    { legend: false, center: opts.center ?? `${Math.round(t.kcal)}`, centerSub: opts.centerSub ?? 'kcal', size: opts.size || 120 });
}

// ================= TODAY =================
async function renderToday(view, alive) {
  const iso = todayISO();
  const [routine, weighins, profile] = await Promise.all([load('routine'), load('weighins'), load('profile').catch(() => ({ targets: {} })), loadMeals()]);
  const workouts = await load('workouts');
  if (!alive()) return;
  const meals = mealsFor(state.person, iso);
  const plan = plannedFor(routine, iso);
  const gymState = store.get(gymKey(iso));
  const loggedToday = workouts.find((w) => w.date === iso);

  // Weigh-in entry for today (adopts an existing Notion row).
  const wkey = `weigh:${state.person}:${iso}`;
  let w = store.get(wkey);
  const existing = weighins.find((x) => x.date === iso);
  if (!w) {
    w = { type: 'weigh', person: state.person, date: iso, weight: existing?.weight ?? '', waist: existing?.waist ?? '', pageId: existing?.id || null };
    store.set(wkey, w);
  } else if (!w.pageId && existing) { w.pageId = existing.id; store.set(wkey, w); }
  const prev = weighins.filter((x) => x.weight != null && x.date < iso).slice(-1)[0];
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nextIdx = meals.findIndex((m) => m.minutes + 45 >= nowMin);

  let workoutHtml;
  if (plan.kind === 'strength') {
    const day = routine.days[plan.letter];
    const version = gymState?.version || defaultVersion(routine, plan.letter);
    const list = day.versions[version] || [];
    workoutHtml = `<div class="card-title"><h2>🏋️ ${esc(plan.label)}</h2><span class="status">${esc(version || '')}</span></div>
      <div class="muted small" style="margin:-.4rem 0 .4rem">${esc(day.title.replace(/^Day [A-Z]\s*[—-]\s*/, ''))}</div>
      <div class="list">${list.map((ex) => `<div class="list-row"><span>${esc(ex.name)}</span><span class="right">${esc(ex.target)}</span></div>`).join('')}</div>`;
  } else if (plan.kind === 'cardio') {
    workoutHtml = `<div class="card-title"><h2>🚶 ${esc(plan.label)}</h2></div>${cardioPlanHtml(routine)}`;
  } else {
    workoutHtml = `<div class="card-title"><h2>😌 ${esc(plan.label || 'Rest')}</h2></div><p class="muted" style="margin:0">No gym today. An easy walk is a bonus.</p>`;
  }
  const loggedSets = loggedToday ? loggedToday.exercises.reduce((a, e) => a + e.sets.length, 0) : 0;

  const nutri = nutritionCard(meals, profile.targets);
  view.innerHTML = `
    <div><h1 class="large-title">Today</h1><div class="subtitle" style="margin-top:0">${esc(fmtLong(iso))}${routine.block ? ` · ${esc(routine.block)}` : ''}</div></div>

    <div class="card">
      <div class="card-title"><h2>⚖️ Weigh-in</h2><span data-status="${esc(wkey)}" class="status"></span></div>
      <div class="weigh">
        <div><label for="w-kg">Weight (kg)</label><input id="w-kg" class="big" inputmode="decimal" enterkeyhint="done" placeholder="${prev ? prev.weight : '—'}" value="${esc(w.weight)}"></div>
        <div><label for="w-waist">Waist (cm)</label><input id="w-waist" class="big" inputmode="decimal" enterkeyhint="done" placeholder="—" value="${esc(w.waist)}"></div>
      </div>
      <div class="muted small" style="margin-top:.5rem">${prev ? `Last: ${prev.weight} kg on ${esc(fmtDate(prev.date))}. ` : ''}Weigh in the morning, before breakfast.</div>
    </div>

    <div class="card">
      ${workoutHtml}
      ${plan.kind !== 'rest' ? `<button class="btn primary block" id="go-gym" style="margin-top:.8rem">${loggedSets ? `Continue in Gym · ${loggedSets} sets logged` : 'Start in Gym'}</button>` : ''}
    </div>

    <div class="card">
      <div class="card-title"><h2>🍽️ Today's food</h2><span class="status">target ${profile.targets?.kcal ? `${profile.targets.kcal.toLocaleString()} kcal` : ''}</span></div>
      ${nutri.html}
    </div>

    <div class="section-label">Meals in order</div>
    <div class="card">
      ${meals.length ? meals.map((m, i) => `<div class="meal ${i === nextIdx ? 'next' : i < nextIdx ? 'past' : ''}">
        <div class="when"><b>${esc(m.slot)}</b>${esc(m.time)}${i === nextIdx ? '<br><span class="pill">Next</span>' : ''}</div>
        <div>${m.fasting ? `<div class="items muted">${esc(m.text)}</div>` : `<div class="items">${m.items.map((it) => esc(itemText(it))).join(' · ')}</div>
          <div class="macro">${m.kcal} kcal · ${m.protein} g protein · ${m.carbs} g carbs · ${m.fat} g fat</div>`}</div>
      </div>`).join('') : '<div class="empty">No meal plan found in Notion.</div>'}
    </div>`;

  drawMacroDonut($('[data-donut="day"]', view), nutri.totals);
  setStatus(wkey, w.pageId && !(store.get(PENDING) || []).includes(wkey) ? 'saved' : 'idle');
  const onWeigh = () => {
    const cur = store.get(wkey);
    cur.weight = $('#w-kg').value.replace(',', '.');
    cur.waist = $('#w-waist').value.replace(',', '.');
    store.set(wkey, cur);
    scheduleSave(wkey);
  };
  $('#w-kg').addEventListener('input', onWeigh);
  $('#w-waist').addEventListener('input', onWeigh);
  for (const id of ['#w-kg', '#w-waist']) $(id).addEventListener('blur', () => flush(wkey));
  $('#go-gym')?.addEventListener('click', () => go('gym'));
}

function cardioPlanHtml(routine) {
  const lines = routine.cardio?.length ? routine.cardio : ['Treadmill at a 4–8% incline, brisk but you can still talk. 30–60 min.'];
  return `<div class="list">${lines.map((l) => `<div class="list-row" style="grid-template-columns:1fr"><span style="font-size:15px">${esc(l)}</span></div>`).join('')}</div>`;
}

// ================= GYM =================
const gymKey = (iso, person = state.person) => `gym:${person}:${iso}`;

function buildGym(routine, choice, version, workouts, iso) {
  const last = {};
  for (const w of workouts) if (w.date !== iso) for (const ex of w.exercises) last[exKey(ex.name)] ||= ex.sets;
  const g = { type: 'gym', person: state.person, date: iso, choice, version: null, block: routine.block, session: choice.label || 'Workout',
    exercises: [], cardio: { minutes: '', incline: '', speed: '' }, durationMin: '', rpe: '', notes: '', pageId: null };
  if (choice.kind === 'strength') {
    g.session = `Strength ${choice.letter}`;
    g.version = version || defaultVersion(routine, choice.letter);
    for (const ex of routine.days[choice.letter]?.versions[g.version] || []) {
      const prev = last[exKey(ex.name)];
      g.exercises.push({
        name: ex.name, target: ex.target, note: ex.note, timed: ex.timed,
        sets: Array.from({ length: ex.sets || 3 }, (_, i) => ({ weight: prev?.[Math.min(i, prev.length - 1)]?.weight ?? '', reps: '', seconds: '', hint: ex.repsLow ?? '', done: false })),
      });
    }
  } else if (choice.kind === 'cardio') {
    g.session = choice.label?.replace(/ or cardio/i, '') || 'Incline walk';
  }
  return g;
}

// Fill a fresh plan with sets already logged in Notion today (e.g. from another phone).
function adoptLogged(g, logged) {
  g.pageId = logged.id;
  for (const lx of logged.exercises) {
    let ex = g.exercises.find((e) => exKey(e.name) === exKey(lx.name));
    if (!ex) { ex = { name: lx.name, target: '', note: '', sets: [] }; g.exercises.push(ex); }
    ex.sets = lx.sets.map((s) => ({ weight: s.weight ?? '', reps: s.reps ?? '', seconds: s.seconds ?? '', hint: '', done: true }));
  }
  const m = logged.cardio?.match(/(\d+)\s*min/);
  if (m) g.cardio.minutes = m[1];
  g.rpe = logged.rpe ?? '';
  g.notes = logged.notes || '';
  g.durationMin = logged.durationMin ?? '';
  return g;
}

async function renderGym(view, alive) {
  const iso = todayISO();
  const [routine, workouts] = await Promise.all([load('routine'), load('workouts')]);
  if (!alive()) return;
  const key = gymKey(iso);
  let g = store.get(key);
  if (!g) {
    const plan = plannedFor(routine, iso);
    const choice = plan.kind === 'rest' || plan.kind === 'other' ? { kind: 'rest', label: plan.label || 'Rest' } : plan;
    g = buildGym(routine, choice, null, workouts, iso);
    const logged = workouts.find((w) => w.date === iso);
    if (logged) adoptLogged(g, logged);
    store.set(key, g);
  }
  const last = {};
  for (const w of workouts) if (w.date !== iso) for (const ex of w.exercises) last[exKey(ex.name)] ||= { date: w.date, sets: ex.sets };
  const letters = Object.keys(routine.days).sort();
  const versions = g.choice.kind === 'strength' ? Object.keys(routine.days[g.choice.letter]?.versions || {}) : [];
  const save = () => { store.set(key, g); scheduleSave(key); };

  const title = g.choice.kind === 'strength' ? `Strength ${g.choice.letter}` : g.choice.kind === 'cardio' ? (g.session || 'Cardio') : 'Rest day';
  const sub = g.choice.kind === 'strength' ? routine.days[g.choice.letter]?.title.replace(/^Day [A-Z]\s*[—-]\s*/, '') : '';
  const cardioCard = (open) => `<div class="card">
      <div class="card-title"><h2>${open ? "🚶 Coach's plan" : '🚶 Cardio'}</h2></div>
      ${open ? `<div style="margin:-.3rem 0 .8rem">${cardioPlanHtml(routine)}</div>` : '<p class="muted small" style="margin:-.3rem 0 .6rem">Optional on strength days.</p>'}
      <div class="cardio-grid">
        <div><label>Minutes</label><input data-cardio="minutes" inputmode="numeric" value="${esc(g.cardio.minutes)}" placeholder="30"></div>
        <div><label>Incline %</label><input data-cardio="incline" inputmode="decimal" value="${esc(g.cardio.incline)}" placeholder="6"></div>
        <div><label>Speed km/h</label><input data-cardio="speed" inputmode="decimal" value="${esc(g.cardio.speed)}" placeholder="5"></div>
      </div></div>`;

  view.innerHTML = `
    <div class="row spread" style="align-items:flex-end">
      <div><h1 class="large-title">${esc(title)}</h1>${sub ? `<div class="subtitle" style="margin-top:0">${esc(sub)}</div>` : ''}</div>
      <span data-status="${esc(key)}" class="status"></span>
    </div>
    ${versions.length > 1 ? `<div class="segmented" id="versions" style="flex:none">${versions.map((v) => `<button data-version="${esc(v)}" aria-selected="${v === g.version}">${esc(v.replace('minutes', 'min'))}</button>`).join('')}</div>` : ''}
    ${g.choice.kind === 'rest' ? `<div class="card rest"><div class="emoji">😌</div><h2>Rest day</h2><p class="muted">Recovery is part of the plan. If you train anyway, pick a workout below.</p></div>` : ''}
    ${g.choice.kind === 'cardio' ? cardioCard(true) : ''}
    <div id="exercises" style="display:grid;gap:1rem"></div>
    ${g.choice.kind !== 'rest' ? `<form class="add-ex" id="add-ex">
      <input id="add-ex-name" placeholder="Add an exercise" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" aria-label="Exercise name">
      <button class="btn tinted" type="submit">Add</button></form>` : ''}
    ${g.choice.kind === 'strength' ? `<details class="card"><summary class="muted">+ Cardio</summary><div style="margin-top:.6rem">${cardioCard(false)}</div></details>` : ''}
    ${g.choice.kind !== 'rest' ? `<div class="card" style="display:grid;gap:.7rem">
      <div class="grid2">
        <div><label for="duration">Total minutes</label><input id="duration" data-field="durationMin" inputmode="numeric" value="${esc(g.durationMin)}"></div>
        <div><label for="rpe">How hard? (1–10)</label><input id="rpe" data-field="rpe" inputmode="numeric" value="${esc(g.rpe)}"></div>
      </div>
      <div><label for="notes">Notes for Coach</label><textarea id="notes" data-field="notes" placeholder="Anything that hurt, felt easy, or needs changing">${esc(g.notes)}</textarea></div>
    </div>` : ''}
    <details class="card"><summary class="muted">Doing a different workout today?</summary>
      <div class="chips" id="choices" style="margin-top:.7rem">
        ${letters.map((l) => `<button data-choice='${esc(JSON.stringify({ kind: 'strength', letter: l, label: `Strength ${l}` }))}' aria-pressed="${g.choice.kind === 'strength' && g.choice.letter === l}">Strength ${l}</button>`).join('')}
        <button data-choice='${esc(JSON.stringify({ kind: 'cardio', label: 'Incline walk' }))}' aria-pressed="${g.choice.kind === 'cardio'}">Cardio</button>
        <button data-choice='${esc(JSON.stringify({ kind: 'rest', label: 'Rest' }))}' aria-pressed="${g.choice.kind === 'rest'}">Rest</button>
      </div></details>
    <p class="muted small" style="text-align:center;margin:0">Everything saves to Notion automatically.</p>`;

  const exWrap = $('#exercises');
  const renderExercises = () => {
    exWrap.innerHTML = g.exercises.map((ex, i) => {
      const prev = last[exKey(ex.name)];
      return `<div class="card exercise" data-ex="${i}">
        <div class="row spread"><h3>${esc(ex.name)}</h3><button class="icon-btn" data-remove-ex="${i}" aria-label="Remove ${esc(ex.name)}">✕</button></div>
        <div class="meta">${esc([ex.target, ex.note].filter(Boolean).join(' · '))}</div>
        ${prev ? `<div class="last">Last time: ${esc(prev.sets.map(fmtSet).join(', '))}</div>` : ''}
        <div class="sets-head"><span>#</span><span>kg</span><span>${ex.timed ? 'sec' : 'reps'}</span><span></span></div>
        <div class="sets">${ex.sets.map((s, j) => `<div class="set${s.done ? ' done' : ''}" data-set="${j}">
            <span class="n">${j + 1}</span>
            <input inputmode="decimal" data-f="weight" placeholder="BW" value="${esc(s.weight)}" aria-label="Weight kg, set ${j + 1}">
            <input inputmode="numeric" data-f="${ex.timed ? 'seconds' : 'reps'}" placeholder="${esc(s.hint ?? '')}" value="${esc(ex.timed ? s.seconds : s.reps)}" aria-label="${ex.timed ? 'Seconds' : 'Reps'}, set ${j + 1}">
            <button class="check" data-check aria-label="Set ${j + 1} done">✓</button>
          </div>`).join('')}</div>
        <button class="link-btn" data-add-set="${i}">+ Add set</button>
      </div>`;
    }).join('');
  };
  renderExercises();
  setStatus(key, saver.status?.[key] || (g.pageId ? 'saved' : 'idle'));

  view.oninput = (e) => {
    const t = e.target;
    if (t.dataset.f) {
      const ex = g.exercises[+t.closest('[data-ex]').dataset.ex];
      const s = ex.sets[+t.closest('[data-set]').dataset.set];
      s[t.dataset.f] = t.value.replace(',', '.');
      if (t.dataset.f !== 'weight') { s.done = !!t.value; t.closest('.set').classList.toggle('done', s.done); }
      save();
    } else if (t.dataset.cardio) { g.cardio[t.dataset.cardio] = t.value.replace(',', '.'); save(); }
    else if (t.dataset.field) { g[t.dataset.field] = t.value; save(); }
  };
  view.onfocusout = () => { if ((store.get(PENDING) || []).includes(key)) flush(key); };

  view.onclick = (e) => {
    const exEl = e.target.closest('[data-ex]');
    if (exEl) {
      const i = +exEl.dataset.ex;
      const ex = g.exercises[i];
      if (e.target.closest('[data-check]')) {
        const j = +e.target.closest('[data-set]').dataset.set;
        const s = ex.sets[j];
        const field = ex.timed ? 'seconds' : 'reps';
        s.done = !s.done;
        if (s.done && !s[field] && s.hint !== '') s[field] = String(s.hint);
        if (!s.done) s[field] = '';
        if (s.done && j + 1 < ex.sets.length && ex.sets[j + 1].weight === '' && s.weight !== '') ex.sets[j + 1].weight = s.weight;
      } else if (e.target.closest('[data-add-set]')) {
        const p = ex.sets[ex.sets.length - 1] || {};
        ex.sets.push({ weight: p.weight ?? '', reps: '', seconds: '', hint: p.hint ?? '', done: false });
      } else if (e.target.closest('[data-remove-ex]')) {
        if (!confirm(`Remove ${ex.name} from today?`)) return;
        g.exercises.splice(i, 1);
      } else return;
      save();
      renderExercises();
      return;
    }
    const v = e.target.closest('[data-version]');
    const c = e.target.closest('[data-choice]');
    if (v || c) {
      const hasData = g.exercises.some((x) => x.sets.some((s) => s.reps || s.seconds));
      const choice = c ? JSON.parse(c.dataset.choice) : g.choice;
      if (hasData && !confirm('Switch workout? Sets you entered for exercises not in the new plan will be dropped.')) return;
      if (v) localStorage.setItem('version', v.dataset.version);
      const fresh = buildGym(routine, choice, v?.dataset.version, workouts, iso);
      // Keep sets already typed for exercises that exist in both plans.
      for (const ex of fresh.exercises) { const old = g.exercises.find((o) => exKey(o.name) === exKey(ex.name)); if (old) ex.sets = old.sets; }
      Object.assign(fresh, { pageId: g.pageId, cardio: g.cardio, rpe: g.rpe, notes: g.notes, durationMin: g.durationMin });
      g = fresh;
      store.set(key, g);
      if (g.pageId || gymSpec.body(g)) scheduleSave(key, 300);
      renderGym(view, alive);
    }
  };
  $('#add-ex')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#add-ex-name');
    const name = input.value.trim();
    if (!name) return;
    input.value = '';
    input.blur();
    const prev = last[exKey(name)];
    g.exercises.push({ name, target: '', note: '', sets: Array.from({ length: 3 }, (_, i) => ({ weight: prev?.sets[i]?.weight ?? '', reps: '', seconds: '', hint: prev?.sets[i]?.reps ?? '', done: false })) });
    store.set(key, g);
    renderExercises();
  });
}

// ================= KITCHEN =================
async function renderKitchen(view, alive) {
  await loadMeals();
  if (!alive()) return;
  const iso = addDays(todayISO(), state.kitchenDay);
  const day = dayOf(iso);
  const people = state.people;
  const byPerson = Object.fromEntries(people.map((p) => [p.id, mealsFor(p.id, iso)]));
  const prep = (state.meals.prep || []).filter((p) => p.day === day);

  // Totals to cook/portion for both people.
  const totals = {};
  for (const p of people) for (const m of byPerson[p.id]) for (const it of m.items || []) {
    if (!it.food) continue;
    const t = (totals[it.food] ||= { label: it.label, unit: it.unit, total: 0, by: {} });
    t.total += it.amount;
    t.by[p.id] = (t.by[p.id] || 0) + it.amount;
  }
  const ORDER = ['groundbeef', 'stewbeef', 'lamb', 'chicken', 'tuna', 'lentils', 'egg', 'yogurt', 'rice', 'toast', 'bigsalad', 'salad', 'veg', 'tomcuc', 'cucumber', 'apple', 'oil'];
  const rows = Object.entries(totals).sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  const amt = (n, unit) => {
    const v = Math.round(n * 100) / 100;
    const frac = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' };
    const whole = Math.floor(v), rest = Math.round((v - whole) * 100) / 100;
    const pretty = unit === 'g' ? `${Math.round(v)}` : (frac[rest] ? `${whole || ''}${frac[rest]}` : `${r1(v)}`);
    const u = { g: ' g', cup: v > 1 ? ' cups' : ' cup', tsp: ' tsp', slice: v > 1 ? ' slices' : ' slice', can: v > 1 ? ' cans' : ' can', plate: v > 1 ? ' plates' : ' plate', each: '' }[unit] ?? '';
    return pretty + u;
  };

  // Group meals by row so both portions sit together.
  const groups = [];
  for (const p of people) for (const m of byPerson[p.id]) {
    let gr = groups.find((x) => x.label === m.label);
    if (!gr) { gr = { label: m.label, slot: m.slot, minutes: m.minutes, by: {} }; groups.push(gr); }
    gr.by[p.id] = m;
    if (p.id === state.person) gr.minutes = m.minutes;
  }
  groups.sort((a, b) => a.minutes - b.minutes);

  // Protein sources for the selected person (pie by ingredient).
  const src = {};
  for (const m of byPerson[state.person]) for (const it of m.items || []) if (it.food && it.macros?.p > 1) src[it.label] = (src[it.label] || 0) + it.macros.p;
  const srcList = Object.entries(src).sort((a, b) => b[1] - a[1]);
  const top = srcList.slice(0, 5);
  const other = srcList.slice(5).reduce((a, x) => a + x[1], 0);
  const pieData = top.map(([label, v], i) => ({ label, value: v, color: `var(--cat-${i + 1})`, display: `${Math.round(v)} g` }));
  if (other > 0) pieData.push({ label: 'Other', value: other, color: 'var(--cat-other)', display: `${Math.round(other)} g` });
  const checks = store.get(`prep:${iso}`) || {};

  view.innerHTML = `
    <div><h1 class="large-title">Kitchen</h1><div class="subtitle" style="margin-top:0">${esc(fmtLong(iso))}</div></div>
    <div class="segmented" id="kday" style="flex:none">
      <button data-kday="0" aria-selected="${state.kitchenDay === 0}">Today</button>
      <button data-kday="1" aria-selected="${state.kitchenDay === 1}">Tomorrow</button>
    </div>
    ${prep.length ? `<div class="card"><div class="card-title"><h2>🧑‍🍳 Prep day</h2><span class="status">${prep.length} steps</span></div>
      ${prep.map((p, i) => `<label class="step ${checks[i] ? 'done' : ''}"><input type="checkbox" data-step="${i}" ${checks[i] ? 'checked' : ''}><span>${esc(p.step)}</span><span class="status">${esc(p.time)}</span></label>`).join('')}</div>` : ''}
    <div class="card"><div class="card-title"><h2>🛒 To make for both</h2></div>
      <div class="list">${rows.map(([, t]) => `<div class="list-row"><div>${esc(t.label)}<div class="sub">${people.filter((p) => t.by[p.id]).map((p) => `${esc(p.name)} ${amt(t.by[p.id], t.unit)}`).join(' · ')}</div></div><span class="right"><b>${amt(t.total, t.unit)}</b></span></div>`).join('') || '<div class="empty">No meals planned.</div>'}</div>
    </div>
    <div class="card"><div class="card-title"><h2>💪 ${esc(personName())}'s protein sources</h2></div><div id="src-pie"></div></div>
    <div class="section-label">Meals</div>
    ${groups.map((gr, gi) => {
      const mine = gr.by[state.person];
      return `<div class="card kmeal">
        <div data-meal-donut="${gi}"></div>
        <div><h3>${esc(gr.slot)} <span class="muted small" style="font-weight:400">${esc(mine?.time || '')}</span></h3>
          ${people.map((p) => { const m = gr.by[p.id]; if (!m) return ''; return `<div class="who"><b>${esc(p.name)}:</b> ${m.fasting ? 'fasting' : `${m.items.map((it) => esc(itemText(it))).join(', ')} <span style="white-space:nowrap">(${m.kcal} kcal)</span>`}</div>`; }).join('')}
        </div></div>`;
    }).join('')}
    <p class="muted small" style="margin:0">Pie charts show ${esc(personName())}'s portion: <span class="swatch" style="background:var(--series-1)"></span> protein <span class="swatch" style="background:var(--series-2)"></span> carbs <span class="swatch" style="background:var(--series-3)"></span> fat, by calories. Carbs and fat are estimates.</p>`;

  donutChart($('#src-pie'), pieData, { size: 150, center: `${Math.round(srcList.reduce((a, x) => a + x[1], 0))}g`, centerSub: 'protein' });
  groups.forEach((gr, gi) => {
    const m = gr.by[state.person] || Object.values(gr.by)[0];
    const el = $(`[data-meal-donut="${gi}"]`, view);
    if (m && !m.fasting) drawMacroDonut(el, m, { size: 84, center: `${m.kcal}`, centerSub: 'kcal' });
    else el.innerHTML = '<div class="muted small" style="text-align:center;padding-top:1.5rem">—</div>';
  });

  view.onclick = (e) => {
    const b = e.target.closest('[data-kday]');
    if (b) { state.kitchenDay = +b.dataset.kday; render(); }
  };
  view.onchange = (e) => {
    const s = e.target.closest('[data-step]');
    if (!s) return;
    checks[s.dataset.step] = s.checked;
    store.set(`prep:${iso}`, checks);
    s.closest('.step').classList.toggle('done', s.checked);
  };
}

// ================= PROGRESS =================
async function renderProgress(view, alive) {
  const [workouts, weighins] = await Promise.all([load('workouts'), load('weighins')]);
  if (!alive()) return;
  const weights = weighins.filter((w) => w.weight != null && w.date);
  const waists = weighins.filter((w) => w.waist != null && w.date);
  const avgAt = (iso) => {
    const from = addDays(iso, -6);
    const win = weights.filter((w) => w.date >= from && w.date <= iso);
    return win.length ? win.reduce((s, w) => s + w.weight, 0) / win.length : null;
  };
  const latest = weights[weights.length - 1];
  const avgNow = latest ? avgAt(latest.date) : null;
  const change = latest && weights.length > 1 ? avgNow - weights[0].weight : null;
  const weekAgoAvg = latest ? avgAt(addDays(latest.date, -7)) : null;
  const ws = weekStart();
  const thisWeek = workouts.filter((w) => w.date && parseDate(w.date) >= ws).length;

  const counts = {}, names = {};
  for (const w of workouts) for (const ex of w.exercises) { const k = exKey(ex.name); counts[k] = (counts[k] || 0) + 1; names[k] ||= ex.name; }
  const exKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const selected = exKeys.includes(state.exercise) ? state.exercise : exKeys[0];

  view.innerHTML = `
    <h1 class="large-title">Progress</h1>
    <div class="tiles">
      <div class="tile"><div class="label">Weight, 7-day avg</div><div class="value">${avgNow ? r1(avgNow) : '–'}</div><div class="sub">${weekAgoAvg && avgNow ? `${avgNow <= weekAgoAvg ? '▼' : '▲'} ${Math.abs(r1(avgNow - weekAgoAvg))} kg this week` : 'kg'}</div></div>
      <div class="tile"><div class="label">Since start</div><div class="value">${change != null ? `${change <= 0 ? '−' : '+'}${Math.abs(r1(change))}` : '–'}</div><div class="sub">kg${weights[0] ? ` since ${esc(fmtDate(weights[0].date))}` : ''}</div></div>
      <div class="tile"><div class="label">Waist</div><div class="value">${waists.length ? waists[waists.length - 1].waist : '–'}</div><div class="sub">cm${waists.length > 1 ? ` · ${r1(waists[waists.length - 1].waist - waists[0].waist)} since start` : ''}</div></div>
      <div class="tile"><div class="label">This week</div><div class="value">${thisWeek}<span class="muted" style="font-size:15px;font-weight:500"> / 5</span></div><div class="sub">sessions</div></div>
    </div>

    <div class="card">
      <div class="card-title"><h2>Body weight</h2><span class="status">kg</span></div>
      <div class="legend-inline"><span><span class="swatch" style="background:var(--series-1);opacity:.4;border-radius:50%"></span>Weigh-ins</span><span><span class="swatch" style="background:var(--series-1);height:3px;width:14px"></span>7-day average</span></div>
      <div id="weight-chart"></div>
    </div>

    ${waists.length > 1 ? `<div class="card"><div class="card-title"><h2>Waist</h2><span class="status">cm</span></div><div id="waist-chart"></div></div>` : ''}

    <div class="card">
      <div class="card-title"><h2>Strength</h2></div>
      ${exKeys.length ? `<select id="ex-select" aria-label="Exercise">${exKeys.map((k) => `<option value="${esc(k)}" ${k === selected ? 'selected' : ''}>${esc(names[k])}</option>`).join('')}</select>
        <div class="tiles" id="ex-tiles" style="margin:.7rem 0"></div>
        <p class="muted small" style="margin:0 0 .3rem">Estimated 1-rep max (kg), from your best set each session.</p>
        <div id="ex-chart"></div><div id="ex-table"></div>` : '<div class="empty">Log a few gym sessions to see your strength trend.</div>'}
    </div>

    <div class="card"><div class="card-title"><h2>Weekly volume</h2><span class="status">kg × reps</span></div><div id="volume-chart"></div></div>

    <details class="card"><summary><b>Recent sessions</b> <span class="muted small">(${workouts.length})</span></summary>
      <div class="list" style="margin-top:.5rem">${workouts.slice(0, 15).map((w) => `<div class="list-row">
        <div>${esc(w.session || 'Workout')} <span class="muted small">${w.date ? esc(fmtDate(w.date)) : ''}</span>
          <div class="sub">${w.exercises.length ? `${w.exercises.length} exercises · ${w.exercises.reduce((a, e) => a + e.sets.length, 0)} sets` : esc(w.cardio || w.notes || '')}${volumeOf(w) ? ` · ${Math.round(volumeOf(w)).toLocaleString()} kg` : ''}</div></div>
        <span class="right"><a href="${esc(w.url)}" target="_blank" rel="noopener" class="small">Notion</a> <button class="btn ghost danger small" data-del="${esc(w.id)}" style="min-height:32px;padding:.2rem .5rem">Delete</button></span>
      </div>`).join('') || '<div class="empty">No sessions yet.</div>'}</div>
    </details>`;

  const trend = weights.map((w) => ({ x: parseDate(w.date), y: r1(avgAt(w.date)) }));
  lineChart($('#weight-chart'), weights.map((w) => ({ x: parseDate(w.date), y: w.weight, tip: `${fmtDate(w.date)}: ${w.weight} kg (avg ${r1(avgAt(w.date))})` })), { trend });
  if (waists.length > 1) lineChart($('#waist-chart'), waists.map((w) => ({ x: parseDate(w.date), y: w.waist, tip: `${fmtDate(w.date)}: ${w.waist} cm` })), { height: 150 });

  const drawExercise = (k) => {
    state.exercise = k;
    const rows = [];
    for (const w of [...workouts].reverse()) {
      const ex = w.exercises.find((e) => exKey(e.name) === k);
      if (!ex) continue;
      const best = ex.sets.reduce((a, s) => (e1rm(s) > e1rm(a) ? s : a), ex.sets[0]);
      rows.push({ date: w.date, best, e1rm: r1(e1rm(best)), top: Math.max(...ex.sets.map((s) => s.weight || 0)), reps: ex.sets.reduce((a, s) => a + (s.reps || 0), 0), sets: ex.sets });
    }
    const first = rows[0], lastR = rows[rows.length - 1];
    $('#ex-tiles').innerHTML = first ? `
      <div class="tile"><div class="label">Heaviest</div><div class="value">${lastR.top || 'BW'}</div><div class="sub">${first.top && lastR.top ? `${lastR.top - first.top >= 0 ? '+' : ''}${r1(lastR.top - first.top)} kg since first` : 'kg'}</div></div>
      <div class="tile"><div class="label">Reps last time</div><div class="value">${lastR.reps}</div><div class="sub">${lastR.reps - first.reps >= 0 ? '+' : ''}${lastR.reps - first.reps} since first</div></div>` : '';
    const pts = rows.filter((r) => r.e1rm > 0);
    if (pts.length) lineChart($('#ex-chart'), pts.map((r) => ({ x: parseDate(r.date), y: r.e1rm, tip: `${fmtDate(r.date)}: ${fmtSet(r.best)} → ~${r.e1rm} kg` })), { height: 170 });
    else $('#ex-chart').innerHTML = '<div class="empty">Bodyweight or timed only. Reps are tracked above.</div>';
    $('#ex-table').innerHTML = `<table class="data" style="margin-top:.6rem"><tr><th>Date</th><th>Sets</th></tr>
      ${rows.slice(-6).reverse().map((r) => `<tr><td>${esc(fmtDate(r.date))}</td><td>${esc(r.sets.map(fmtSet).join(', '))}</td></tr>`).join('')}</table>`;
  };
  if (selected) { drawExercise(selected); $('#ex-select').addEventListener('change', (e) => drawExercise(e.target.value)); }

  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(ws); start.setDate(start.getDate() - i * 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const inWeek = workouts.filter((w) => w.date && parseDate(w.date) >= start && parseDate(w.date) < end);
    const vol = Math.round(inWeek.reduce((s, w) => s + volumeOf(w), 0));
    const label = start.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
    weeks.push({ label, value: vol, dim: i === 0, tip: `Week of ${label}: ${vol.toLocaleString()} kg, ${inWeek.length} session${inWeek.length === 1 ? '' : 's'}${i === 0 ? ' (so far)' : ''}` });
  }
  barChart($('#volume-chart'), weeks, { height: 160 });

  view.onclick = async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('Delete this session? It moves to Notion trash.')) return;
    try {
      await api(`people/${state.person}/entries/${b.dataset.del}`, { method: 'DELETE' });
      pc().workouts = pc().workouts.filter((w) => w.id !== b.dataset.del);
      for (const k of Object.keys(localStorage)) if (k.startsWith('gym:') && store.get(k)?.pageId === b.dataset.del) store.del(k);
      toast('Deleted');
      render();
    } catch (err) { toast(err.message); }
  };
}

// ================= WEEK =================
async function renderWeek(view, alive) {
  const [routine] = await Promise.all([load('routine'), loadMeals()]);
  if (!alive()) return;
  const today = todayISO();
  const monday = isoOf(weekStart());
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  view.innerHTML = `<h1 class="large-title">This week</h1>
    ${routine.block ? `<div class="subtitle" style="margin-top:-.4rem">${esc(routine.block)} · ${esc(personName())}</div>` : ''}
    ${days.map((iso) => {
      const plan = plannedFor(routine, iso);
      const meals = mealsFor(state.person, iso);
      const t = dayTotals(meals);
      const main = meals.filter((m) => /lunch|dinner/i.test(m.slot)).map((m) => shortMeal(m).split(' · ')[0]).join(' / ');
      const icon = plan.kind === 'strength' ? '🏋️' : plan.kind === 'cardio' ? '🚶' : '😌';
      const exs = plan.kind === 'strength' ? (routine.days[plan.letter]?.versions[defaultVersion(routine, plan.letter)] || []) : [];
      return `<details class="card day-card ${iso === today ? 'today' : ''}" ${iso === today ? 'open' : ''}>
        <summary><div class="dname">${DAYS[parseDate(iso).getDay()]}</div>
          <div><div class="dsub">${icon} ${esc(plan.label || 'Rest')}${iso === today ? '<span class="pill">Today</span>' : ''}</div><div class="dsub2">${esc(main)}${t.kcal ? ` · ${Math.round(t.kcal)} kcal` : ''}</div></div>
          <span class="chev">›</span></summary>
        <div class="body">
          ${exs.length ? `<div class="list">${exs.map((ex) => `<div class="list-row"><span>${esc(ex.name)}</span><span class="right">${esc(ex.target)}</span></div>`).join('')}</div>` : ''}
          <div class="list" style="margin-top:${exs.length ? '.6rem' : '0'}">${meals.map((m) => `<div class="list-row"><div>${esc(m.slot)} <span class="muted small">${esc(m.time)}</span><div class="sub">${m.fasting ? 'Fasting' : esc(m.items.map(itemText).join(', '))}</div></div><span class="right">${m.fasting ? '' : `${m.kcal} kcal`}</span></div>`).join('')}</div>
        </div></details>`;
    }).join('')}`;
}

// ================= install hint & service worker =================
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
if (isIOS && !standalone && !localStorage.getItem('install-hint-closed')) $('#install-hint').hidden = false;
$('#install-close').addEventListener('click', () => { localStorage.setItem('install-hint-closed', '1'); $('#install-hint').hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

start();
