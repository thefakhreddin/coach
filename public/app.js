import { lineChart, barChart } from './charts.js';

// ---------------- helpers ----------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const parseDate = (s) => new Date(`${s}T12:00:00`);
const fmtDate = (s) => parseDate(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const exKey = (n) => String(n).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const fmtSet = (s) => (s.seconds && !s.reps ? `${s.seconds}s` : `${s.weight ? `${s.weight}kg` : 'BW'}×${s.reps}`);
const e1rm = (s) => (s.weight && s.reps ? s.weight * (1 + Math.min(s.reps, 15) / 30) : 0);
const round1 = (n) => Math.round(n * 10) / 10;

async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
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

// ---------------- state ----------------
const state = {
  people: [],
  person: localStorage.getItem('person') || 'amir',
  tab: localStorage.getItem('tab') || 'today',
  planDoc: 'routine',
  cache: {}, // per person: { routine, workouts, weighins, docs: {} }
};
const pc = () => (state.cache[state.person] ||= { docs: {} });

async function load(kind, { fresh = false } = {}) {
  const c = pc();
  if (!fresh && c[kind]) return c[kind];
  const q = fresh ? '?fresh=1' : '';
  c[kind] = await api(`people/${state.person}/${kind}${kind === 'routine' ? q : ''}`);
  return c[kind];
}
async function loadDoc(key, { fresh = false } = {}) {
  const c = pc();
  if (!fresh && c.docs[key]) return c.docs[key];
  c.docs[key] = await api(`people/${state.person}/doc/${key}${fresh ? '?fresh=1' : ''}`);
  return c.docs[key];
}

// ---------------- boot ----------------
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
  } catch (err) {
    if (err.message !== 'Please sign in') { $('#view').innerHTML = `<div class="card error">${esc(err.message)}</div>`; $('#main').hidden = false; }
  }
}

function renderPeople() {
  $('#people').innerHTML = state.people.map((p) =>
    `<button role="tab" data-person="${p.id}" aria-selected="${p.id === state.person}">${p.emoji} ${esc(p.name)}</button>`).join('');
}
$('#people').addEventListener('click', (e) => {
  const b = e.target.closest('[data-person]');
  if (!b) return;
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
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab;
  localStorage.setItem('tab', state.tab);
  renderTabs();
  render();
  window.scrollTo(0, 0);
});

$('#refresh').addEventListener('click', async () => {
  state.cache[state.person] = { docs: {} };
  try {
    await load('routine', { fresh: true });
    if (state.tab === 'plan') await loadDoc(state.planDoc, { fresh: true });
  } catch { /* shown by render */ }
  render();
  toast('Reloaded from Notion');
});

async function render() {
  const view = $('#view');
  const person = state.person;
  const tab = state.tab;
  view.onclick = null;
  view.innerHTML = '<div class="spinner">Loading…</div>';
  try {
    const fn = { today: renderToday, plan: renderPlan, history: renderHistory, progress: renderProgress }[tab];
    await fn(view);
  } catch (err) {
    if (person === state.person && tab === state.tab) view.innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p></div>`;
  }
}

// ---------------- Today (log a workout) ----------------
const draftKey = () => `draft:${state.person}`;
const getDraft = () => { try { return JSON.parse(localStorage.getItem(draftKey())); } catch { return null; } };
const saveDraft = (d) => localStorage.setItem(draftKey(), JSON.stringify(d));

function lastPerformance(workouts) {
  // Most recent logged sets per exercise (workouts are newest first).
  const map = {};
  for (const w of workouts) for (const ex of w.exercises) {
    const k = exKey(ex.name);
    if (!map[k]) map[k] = { date: w.date, sets: ex.sets };
  }
  return map;
}

function newDraft(routine, choice, version, workouts) {
  const last = lastPerformance(workouts);
  const d = { date: todayISO(), choice, version, block: routine.block, durationMin: '', rpe: '', notes: '', cardio: '', exercises: [] };
  if (choice.kind === 'strength') {
    const day = routine.days[choice.letter];
    d.session = `Strength ${choice.letter}`;
    for (const ex of day.versions[version] || []) {
      const prev = last[exKey(ex.name)];
      const n = ex.sets || 3;
      d.exercises.push({
        name: ex.name, target: ex.target, note: ex.note, timed: ex.timed,
        sets: Array.from({ length: n }, (_, i) => ({
          weight: prev?.sets[Math.min(i, prev.sets.length - 1)]?.weight ?? '',
          reps: '', seconds: '', hint: ex.timed ? ex.repsLow : ex.repsLow, done: false,
        })),
      });
    }
  } else if (choice.kind === 'cardio') {
    d.session = 'Incline walk';
  } else {
    d.session = choice.label || 'Workout';
  }
  return d;
}

async function renderToday(view) {
  const [routine, workouts] = await Promise.all([load('routine'), load('workouts')]);
  const dayName = DAYS[new Date().getDay()];
  const planned = plannedFor(routine, dayName);
  const letters = Object.keys(routine.days).sort();

  let draft = getDraft();
  if (draft && draft.date !== todayISO() && !draftHasData(draft)) draft = null;
  if (!draft) {
    const choice = planned.kind === 'strength' || planned.kind === 'cardio' ? planned : (letters[0] ? { kind: 'strength', letter: nextLetter(routine, workouts) } : { kind: 'other', label: 'Workout' });
    draft = newDraft(routine, choice, defaultVersion(routine, choice), workouts);
    saveDraft(draft);
  }
  const last = lastPerformance(workouts);
  const doneThisWeek = workoutsThisWeek(workouts).length;

  const choiceChip = (c, label) => {
    const on = c.kind === draft.choice.kind && (c.letter || '') === (draft.choice.letter || '');
    return `<button data-choice='${esc(JSON.stringify(c))}' aria-pressed="${on}">${esc(label)}</button>`;
  };
  const versions = draft.choice.kind === 'strength' ? Object.keys(routine.days[draft.choice.letter]?.versions || {}) : [];

  view.innerHTML = `
    <div class="today-head">
      <div class="muted small">${esc(fmtDate(todayISO()))} · ${esc(routine.block || '')} · ${doneThisWeek} session${doneThisWeek === 1 ? '' : 's'} this week</div>
      <h1>${planned.label ? `Today: ${esc(planned.label)}` : 'Log a workout'}</h1>
    </div>
    <div class="card">
      <label>What are you doing?</label>
      <div class="chips" id="choices">
        ${letters.map((l) => choiceChip({ kind: 'strength', letter: l }, `Strength ${l}`)).join('')}
        ${choiceChip({ kind: 'cardio', label: 'Incline walk' }, 'Cardio')}
        ${choiceChip({ kind: 'other', label: 'Other' }, 'Other')}
      </div>
      ${versions.length > 1 ? `<div style="margin-top:.75rem"><label>Version</label><div class="chips" id="versions">
        ${versions.map((v) => `<button data-version="${esc(v)}" aria-pressed="${v === draft.version}">${esc(v)}</button>`).join('')}</div></div>` : ''}
      ${draft.choice.kind === 'strength' && routine.days[draft.choice.letter] ? `<p class="muted small" style="margin:.6rem 0 0">${esc(routine.days[draft.choice.letter].title)}</p>` : ''}
    </div>
    <div id="exercises" style="display:grid;gap:1rem"></div>
    <button class="btn block ghost" id="add-ex">+ Add exercise</button>
    <div class="card" style="display:grid;gap:.7rem">
      <div><label for="cardio">Cardio</label><input id="cardio" placeholder="e.g. Incline walk 30 min, 6%, 5 km/h" value="${esc(draft.cardio)}"></div>
      <div class="grid3">
        <div><label for="date">Date</label><input id="date" type="date" value="${esc(draft.date)}"></div>
        <div><label for="duration">Minutes</label><input id="duration" type="number" inputmode="numeric" min="0" value="${esc(draft.durationMin)}"></div>
        <div><label for="rpe">Effort 1–10</label><input id="rpe" type="number" inputmode="numeric" min="1" max="10" value="${esc(draft.rpe)}"></div>
      </div>
      <div><label for="notes">Notes</label><textarea id="notes" placeholder="How did it feel? Anything to tell Coach?">${esc(draft.notes)}</textarea></div>
    </div>
    <div class="save-bar row">
      <button class="btn ghost" id="reset" style="white-space:nowrap">Reset</button>
      <button class="btn primary block" id="save">Save to Notion</button>
    </div>`;

  const exWrap = $('#exercises');
  const renderExercises = () => {
    exWrap.innerHTML = draft.exercises.map((ex, i) => {
      const prev = last[exKey(ex.name)];
      return `<div class="card exercise" data-ex="${i}">
        <div class="row spread"><h3>${esc(ex.name)}</h3><button class="icon-btn" data-remove-ex="${i}" aria-label="Remove exercise">✕</button></div>
        <div class="meta">${esc([ex.target, ex.note].filter(Boolean).join(' · '))}</div>
        ${prev ? `<div class="last">Last time (${esc(fmtDate(prev.date))}): ${esc(prev.sets.map(fmtSet).join(', '))}</div>` : ''}
        <div class="sets-head"><span>#</span><span>kg</span><span>${ex.timed ? 'sec' : 'reps'}</span><span></span></div>
        <div class="sets">
          ${ex.sets.map((s, j) => `<div class="set${s.done ? ' done' : ''}" data-set="${j}">
            <span class="n">${j + 1}</span>
            <input inputmode="decimal" data-f="weight" placeholder="BW" value="${esc(s.weight)}" aria-label="Weight kg, set ${j + 1}">
            <input inputmode="numeric" data-f="${ex.timed ? 'seconds' : 'reps'}" placeholder="${esc(s.hint ?? '')}" value="${esc(ex.timed ? s.seconds : s.reps)}" aria-label="${ex.timed ? 'Seconds' : 'Reps'}, set ${j + 1}">
            <button class="check" data-check aria-label="Mark set ${j + 1} done">✓</button>
          </div>`).join('')}
        </div>
        <button class="link-btn" data-add-set="${i}">+ Add set</button>
      </div>`;
    }).join('') || (draft.choice.kind === 'strength' ? '<div class="card empty">No exercises found for this day in Notion.</div>' : '');
  };
  renderExercises();

  exWrap.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    const i = +e.target.closest('[data-ex]').dataset.ex;
    const j = +e.target.closest('[data-set]').dataset.set;
    draft.exercises[i].sets[j][f] = e.target.value.replace(',', '.');
    saveDraft(draft);
  });
  exWrap.addEventListener('click', (e) => {
    const exEl = e.target.closest('[data-ex]');
    if (!exEl) return;
    const i = +exEl.dataset.ex;
    const ex = draft.exercises[i];
    if (e.target.closest('[data-check]')) {
      const j = +e.target.closest('[data-set]').dataset.set;
      const s = ex.sets[j];
      s.done = !s.done;
      const field = ex.timed ? 'seconds' : 'reps';
      if (s.done && !s[field] && s.hint) s[field] = String(s.hint); // accept the suggested reps
      if (s.done && j + 1 < ex.sets.length && ex.sets[j + 1].weight === '' && s.weight !== '') ex.sets[j + 1].weight = s.weight;
    } else if (e.target.closest('[data-add-set]')) {
      const prev = ex.sets[ex.sets.length - 1] || {};
      ex.sets.push({ weight: prev.weight ?? '', reps: '', seconds: '', hint: prev.hint, done: false });
    } else if (e.target.closest('[data-remove-ex]')) {
      if (!confirm(`Remove ${ex.name}?`)) return;
      draft.exercises.splice(i, 1);
    } else return;
    saveDraft(draft);
    renderExercises();
  });

  $('#add-ex').addEventListener('click', () => {
    const name = prompt('Exercise name');
    if (!name?.trim()) return;
    const prev = last[exKey(name)];
    draft.exercises.push({ name: name.trim(), target: '', note: '', sets: Array.from({ length: 3 }, (_, i) => ({ weight: prev?.sets[i]?.weight ?? '', reps: '', seconds: '', hint: prev?.sets[i]?.reps ?? '', done: false })) });
    saveDraft(draft);
    renderExercises();
  });

  for (const [id, key] of [['cardio', 'cardio'], ['date', 'date'], ['duration', 'durationMin'], ['rpe', 'rpe'], ['notes', 'notes']]) {
    $(`#${id}`).addEventListener('input', (e) => { draft[key] = e.target.value; saveDraft(draft); });
  }

  const switchTo = (choice, version) => {
    if (draftHasData(draft) && !confirm('Switch workout? The sets you entered will be cleared.')) return;
    const keep = { date: draft.date, durationMin: draft.durationMin, rpe: draft.rpe, notes: draft.notes, cardio: draft.cardio };
    draft = { ...newDraft(routine, choice, version ?? defaultVersion(routine, choice), workouts), ...keep };
    saveDraft(draft);
    renderToday(view);
  };
  $('#choices').addEventListener('click', (e) => {
    const b = e.target.closest('[data-choice]');
    if (b) switchTo(JSON.parse(b.dataset.choice));
  });
  $('#versions')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-version]');
    if (b) { localStorage.setItem('version', b.dataset.version); switchTo(draft.choice, b.dataset.version); }
  });
  $('#reset').addEventListener('click', () => {
    if (!confirm('Clear everything you entered for this workout?')) return;
    localStorage.removeItem(draftKey());
    renderToday(view);
  });

  $('#save').addEventListener('click', async () => {
    const exercises = draft.exercises.map((ex) => ({
      name: ex.name,
      sets: ex.sets.filter((s) => Number(s.reps) > 0 || Number(s.seconds) > 0)
        .map((s) => ({ weight: s.weight === '' ? null : Number(s.weight), reps: s.reps === '' ? null : Number(s.reps), seconds: s.seconds === '' ? null : Number(s.seconds) })),
    })).filter((ex) => ex.sets.length);
    if (!exercises.length && !draft.cardio.trim() && !draft.notes.trim()) {
      toast('Enter at least one set, some cardio or a note');
      return;
    }
    const btn = $('#save');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const saved = await api(`people/${state.person}/workouts`, {
        method: 'POST',
        body: { date: draft.date, session: draft.session, block: draft.block, durationMin: draft.durationMin, rpe: draft.rpe, notes: draft.notes, cardio: draft.cardio, exercises },
      });
      pc().workouts = [saved, ...(pc().workouts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      localStorage.removeItem(draftKey());
      toast('Saved to Notion 💪');
      state.tab = 'history';
      localStorage.setItem('tab', state.tab);
      renderTabs();
      render();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'Save to Notion';
    }
  });
}

function draftHasData(d) {
  return d.exercises?.some((ex) => ex.sets.some((s) => s.reps || s.seconds || s.done)) || !!d.cardio || !!d.notes;
}
function plannedFor(routine, dayName) {
  const entry = routine.schedule.find((s) => s.day === dayName);
  if (!entry) return { kind: 'unknown', label: '' };
  const m = entry.session.match(/(?:Strength|Day)\s+([A-Z])\b/i);
  if (m && routine.days[m[1].toUpperCase()]) return { kind: 'strength', letter: m[1].toUpperCase(), label: entry.session };
  if (/walk|cardio|bike/i.test(entry.session)) return { kind: 'cardio', label: entry.session };
  return { kind: /rest/i.test(entry.session) ? 'rest' : 'other', label: entry.session };
}
function nextLetter(routine, workouts) {
  const letters = Object.keys(routine.days).sort();
  const lastStrength = workouts.find((w) => /Strength\s+[A-Z]/i.test(w.session));
  if (!lastStrength) return letters[0];
  const l = lastStrength.session.match(/Strength\s+([A-Z])/i)[1].toUpperCase();
  return letters[(letters.indexOf(l) + 1) % letters.length] || letters[0];
}
function defaultVersion(routine, choice) {
  if (choice.kind !== 'strength') return null;
  const vs = Object.keys(routine.days[choice.letter]?.versions || {});
  const saved = localStorage.getItem('version');
  if (saved && vs.includes(saved)) return saved;
  return vs.find((v) => /45|60/.test(v)) || vs[vs.length - 1] || null;
}
function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}
function workoutsThisWeek(workouts) {
  const ws = weekStart();
  return workouts.filter((w) => w.date && parseDate(w.date) >= ws);
}

// ---------------- Plan (Notion pages) ----------------
async function renderPlan(view) {
  const tabs = [['routine', 'Routine'], ['diet', 'Diet'], ['overview', 'Profile & week']];
  view.innerHTML = `<div class="chips" id="doc-tabs">${tabs.map(([k, l]) => `<button data-doc="${k}" aria-pressed="${k === state.planDoc}">${l}</button>`).join('')}</div>
    <div class="card doc" id="doc"><div class="spinner">Loading from Notion…</div></div>`;
  $('#doc-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-doc]');
    if (b) { state.planDoc = b.dataset.doc; renderPlan(view); }
  });
  const doc = await loadDoc(state.planDoc);
  $('#doc').innerHTML = renderBlocks(doc.blocks) + `<p class="muted small" style="margin-top:1rem">Synced from Notion ${esc(new Date(doc.fetchedAt).toLocaleString())}. Tap ⟳ to reload.</p>`;
}

function rich(segs = []) {
  return segs.map((s) => {
    let h = esc(s.t).replace(/\n/g, '<br>');
    if (s.c) h = `<code>${h}</code>`;
    if (s.b) h = `<strong>${h}</strong>`;
    if (s.i) h = `<em>${h}</em>`;
    if (s.s) h = `<s>${h}</s>`;
    if (s.href) h = `<a href="${esc(s.href)}" target="_blank" rel="noopener">${h}</a>`;
    return h;
  }).join('');
}

function renderBlocks(blocks = []) {
  let html = '';
  let list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const b of blocks) {
    const kids = b.children ? renderBlocks(b.children) : '';
    if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item' || b.type === 'to_do') {
      const tag = b.type === 'numbered_list_item' ? 'ol' : 'ul';
      if (list !== tag) { closeList(); html += `<${tag}>`; list = tag; }
      html += `<li>${b.type === 'to_do' ? (b.checked ? '☑ ' : '☐ ') : ''}${rich(b.text)}${kids}</li>`;
      continue;
    }
    closeList();
    switch (b.type) {
      case 'heading_1': case 'heading_2': case 'heading_3': {
        const lvl = { heading_1: 2, heading_2: 2, heading_3: 3 }[b.type];
        html += b.children ? `<details><summary>${rich(b.text)}</summary>${kids}</details>` : `<h${lvl}>${rich(b.text)}</h${lvl}>`;
        break;
      }
      case 'paragraph': html += `<p>${rich(b.text)}</p>${kids}`; break;
      case 'quote': html += `<blockquote>${rich(b.text)}${kids}</blockquote>`; break;
      case 'callout': html += `<div class="callout"><span>${esc(b.icon || '💡')}</span><div>${rich(b.text)}${kids}</div></div>`; break;
      case 'toggle': html += `<details><summary>${rich(b.text)}</summary>${kids}</details>`; break;
      case 'divider': html += '<hr>'; break;
      case 'code': html += `<pre><code>${rich(b.text)}</code></pre>`; break;
      case 'table': {
        const rows = b.rows || [];
        html += '<div class="table-wrap"><table>' + rows.map((r, i) => {
          const tag = b.header && i === 0 ? 'th' : 'td';
          return `<tr>${r.map((c) => `<${tag}>${rich(c)}</${tag}>`).join('')}</tr>`;
        }).join('') + '</table></div>';
        break;
      }
      case 'child_database': html += `<p class="muted">📊 ${rich(b.text)} (see History / Progress)</p>`; break;
      case 'child_page': html += `<p class="muted">📄 ${rich(b.text)}</p>`; break;
      default: html += b.text ? `<p>${rich(b.text)}</p>${kids}` : kids;
    }
  }
  closeList();
  return html;
}

// ---------------- History ----------------
async function renderHistory(view) {
  const workouts = await load('workouts');
  if (!workouts.length) {
    view.innerHTML = '<div class="card empty">No workouts logged yet. Log your first one from the Today tab.</div>';
    return;
  }
  view.innerHTML = workouts.map((w) => `
    <div class="card workout">
      <div class="row spread">
        <div><h3>${esc(w.session || 'Workout')}</h3><div class="muted small">${w.date ? esc(fmtDate(w.date)) : ''}</div></div>
        <div class="row">${w.block ? `<span class="tag">${esc(w.block)}</span>` : ''}</div>
      </div>
      <div class="row wrap small muted" style="margin-top:.4rem">
        ${w.durationMin != null ? `<span>⏱ ${w.durationMin} min</span>` : ''}
        ${w.rpe != null ? `<span>💥 Effort ${w.rpe}/10</span>` : ''}
        ${volumeOf(w) ? `<span>🏋️ ${Math.round(volumeOf(w)).toLocaleString()} kg volume</span>` : ''}
      </div>
      ${w.exercisesText ? `<pre>${esc(w.exercisesText)}</pre>` : ''}
      ${w.cardio ? `<pre>🚶 ${esc(w.cardio)}</pre>` : ''}
      ${w.notes ? `<pre>📝 ${esc(w.notes)}</pre>` : ''}
      <div class="row spread" style="margin-top:.5rem">
        <a class="small" href="${esc(w.url)}" target="_blank" rel="noopener">Open in Notion</a>
        <button class="btn ghost danger small" data-del="${esc(w.id)}">Delete</button>
      </div>
    </div>`).join('');
  view.onclick = async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('Delete this workout? It moves to Notion trash.')) return;
    try {
      await api(`people/${state.person}/entries/${b.dataset.del}`, { method: 'DELETE' });
      pc().workouts = pc().workouts.filter((w) => w.id !== b.dataset.del);
      toast('Deleted');
      render();
    } catch (err) { toast(err.message); }
  };
}

const volumeOf = (w) => w.exercises.reduce((sum, ex) => sum + ex.sets.reduce((s, x) => s + (x.weight || 0) * (x.reps || 0), 0), 0);

// ---------------- Progress ----------------
async function renderProgress(view) {
  const [workouts, weighins] = await Promise.all([load('workouts'), load('weighins')]);
  const weights = weighins.filter((w) => w.weight != null && w.date);
  const waists = weighins.filter((w) => w.waist != null && w.date);
  const latest = weights[weights.length - 1];
  const avgOf = (arr, end) => {
    const from = new Date(parseDate(end.date) - 6 * 86400000);
    const win = arr.filter((w) => parseDate(w.date) >= from && parseDate(w.date) <= parseDate(end.date));
    return win.reduce((s, w) => s + w.weight, 0) / win.length;
  };
  const avgNow = latest ? avgOf(weights, latest) : null;
  const change = latest && weights.length > 1 ? avgNow - weights[0].weight : null;
  const thisWeek = workoutsThisWeek(workouts).length;

  // Exercise list, most logged first.
  const counts = {};
  const names = {};
  for (const w of workouts) for (const ex of w.exercises) {
    const k = exKey(ex.name);
    counts[k] = (counts[k] || 0) + 1;
    names[k] ||= ex.name;
  }
  const exKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const selected = exKeys.includes(state.exercise) ? state.exercise : exKeys[0];

  view.innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="label">This week</div><div class="value">${thisWeek}</div><div class="sub">sessions (plan: 5)</div></div>
      <div class="tile"><div class="label">Total logged</div><div class="value">${workouts.length}</div><div class="sub">sessions</div></div>
      <div class="tile"><div class="label">Weight (7-day avg)</div><div class="value">${avgNow ? round1(avgNow) : '–'}</div><div class="sub">${change != null ? `${change <= 0 ? '▼' : '▲'} ${Math.abs(round1(change))} kg since ${esc(fmtDate(weights[0].date))}` : 'kg'}</div></div>
      <div class="tile"><div class="label">Waist</div><div class="value">${waists.length ? waists[waists.length - 1].waist : '–'}</div><div class="sub">cm${waists.length > 1 ? ` · ${round1(waists[waists.length - 1].waist - waists[0].waist)} since start` : ''}</div></div>
    </div>

    <div class="card">
      <h2>Log a weigh-in</h2>
      <form id="weigh-form" class="grid3" style="align-items:end">
        <div><label for="w-date">Date</label><input id="w-date" type="date" value="${todayISO()}" required></div>
        <div><label for="w-kg">Weight kg</label><input id="w-kg" inputmode="decimal" placeholder="${latest ? latest.weight : ''}"></div>
        <div><label for="w-waist">Waist cm</label><input id="w-waist" inputmode="decimal"></div>
        <button class="btn primary" style="grid-column:1/-1" type="submit">Save weigh-in</button>
      </form>
    </div>

    <div class="card">
      <h2>Body weight (kg)</h2>
      <div id="weight-chart"></div>
      <details style="margin-top:.5rem"><summary class="small muted">Show table</summary>
        <table class="data"><tr><th>Date</th><th class="num">Weight kg</th><th class="num">Waist cm</th></tr>
        ${[...weighins].reverse().map((w) => `<tr><td>${esc(fmtDate(w.date))}</td><td class="num">${w.weight ?? ''}</td><td class="num">${w.waist ?? ''}</td></tr>`).join('')}</table>
      </details>
    </div>

    <div class="card">
      <h2>Strength progress</h2>
      ${exKeys.length ? `<select id="ex-select" aria-label="Exercise">${exKeys.map((k) => `<option value="${esc(k)}" ${k === selected ? 'selected' : ''}>${esc(names[k])} (${counts[k]})</option>`).join('')}</select>
      <p class="muted small" style="margin:.5rem 0">Estimated 1-rep max (kg) from your best set each session.</p>
      <div id="ex-chart"></div>
      <div id="ex-table"></div>` : '<div class="empty">Log a few strength sessions to see progress here.</div>'}
    </div>

    <div class="card">
      <h2>Weekly volume (kg × reps)</h2>
      <div id="volume-chart"></div>
    </div>`;

  lineChart($('#weight-chart'), weights.map((w) => ({ x: parseDate(w.date), y: w.weight, tip: `${fmtDate(w.date)}: ${w.weight} kg` })), { unit: ' kg' });

  const drawExercise = (key) => {
    state.exercise = key;
    const rows = [];
    for (const w of [...workouts].reverse()) {
      const ex = w.exercises.find((e) => exKey(e.name) === key);
      if (!ex) continue;
      const best = ex.sets.reduce((a, s) => (e1rm(s) > e1rm(a) ? s : a), ex.sets[0]);
      rows.push({ date: w.date, best, e1rm: round1(e1rm(best)), volume: ex.sets.reduce((s, x) => s + (x.weight || 0) * (x.reps || 0), 0), sets: ex.sets });
    }
    const pts = rows.filter((r) => r.e1rm > 0);
    if (pts.length) {
      lineChart($('#ex-chart'), pts.map((r) => ({ x: parseDate(r.date), y: r.e1rm, tip: `${fmtDate(r.date)}: ${fmtSet(r.best)} → ~${r.e1rm} kg 1RM` })), { unit: ' kg' });
    } else {
      $('#ex-chart').innerHTML = '<div class="empty">No weighted sets for this exercise yet (bodyweight or timed only).</div>';
    }
    $('#ex-table').innerHTML = `<table class="data" style="margin-top:.75rem"><tr><th>Date</th><th>Sets</th><th class="num">Est. 1RM</th></tr>
      ${rows.slice().reverse().map((r) => `<tr><td>${esc(fmtDate(r.date))}</td><td>${esc(r.sets.map(fmtSet).join(', '))}</td><td class="num">${r.e1rm || '–'}</td></tr>`).join('')}</table>`;
  };
  if (selected) {
    drawExercise(selected);
    $('#ex-select').addEventListener('change', (e) => drawExercise(e.target.value));
  }

  // Weekly volume, last 8 weeks.
  const weeks = [];
  const ws = weekStart();
  for (let i = 7; i >= 0; i--) {
    const start = new Date(ws); start.setDate(start.getDate() - i * 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const inWeek = workouts.filter((w) => w.date && parseDate(w.date) >= start && parseDate(w.date) < end);
    const vol = Math.round(inWeek.reduce((s, w) => s + volumeOf(w), 0));
    const label = start.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
    weeks.push({ label, value: vol, dim: i === 0, tip: `Week of ${label}: ${vol.toLocaleString()} kg, ${inWeek.length} session${inWeek.length === 1 ? '' : 's'}${i === 0 ? ' (in progress)' : ''}` });
  }
  barChart($('#volume-chart'), weeks);

  $('#weigh-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const weight = $('#w-kg').value.replace(',', '.');
    const waist = $('#w-waist').value.replace(',', '.');
    if (!weight && !waist) { toast('Enter a weight or waist'); return; }
    try {
      const saved = await api(`people/${state.person}/weighins`, { method: 'POST', body: { date: $('#w-date').value, weight, waist } });
      pc().weighins = [...(pc().weighins || []), saved].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      toast('Weigh-in saved to Notion');
      renderProgress(view);
    } catch (err) { toast(err.message); }
  });
}

start();
