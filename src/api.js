// All /api/* routes. Runtime-agnostic: takes a Web Request, returns a Web Response.
import { PEOPLE, SHARED, ROUTINE_BLOCK_OPTIONS } from './config.js';
import { parseMealsPage, parseTargets } from './meals.js';
import { planFromRows, setFromPage, setLogProps } from './setlog.js';
import { fetchBlockTree, simplifyBlocks, parseRoutine, plain } from './notion.js';
import { formatExercises, parseExercises } from './sets.js';
import { authEnabled, checkPassword, makeSessionCookie, clearSessionCookie, isAuthenticated } from './auth.js';

const DOC_TTL_MS = 5 * 60 * 1000;
const docCache = new Map();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

const normId = (id) => String(id || '').replace(/-/g, '');

export async function handleApi(request, env, client) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method;
  const secure = url.protocol === 'https:';

  try {
    // ---- auth ----
    if (parts[0] === 'login' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!authEnabled(env)) return json({ ok: true });
      if (!(await checkPassword(env, body.password))) {
        await new Promise((r) => setTimeout(r, 800)); // slow down guessing
        return json({ error: 'Wrong password' }, 401);
      }
      return json({ ok: true }, 200, { 'Set-Cookie': await makeSessionCookie(env, secure) });
    }
    if (parts[0] === 'logout' && method === 'POST') {
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(secure) });
    }
    // Public health check: can the server reach each Notion database/page? (yes/no only, no data)
    if (parts[0] === 'health' && method === 'GET') {
      if (!client) return json({ ok: false, error: 'NOTION_TOKEN is not set' }, 500);
      const targets = [
        ['Exercise Plan', SHARED.exercisePlan, 'db'], ['Set Log', SHARED.setLog, 'db'], ['Shared Meals & Prep', SHARED.meals, 'page'],
        ...Object.values(PEOPLE).flatMap((p) => [
          [`${p.name} – Workout Log`, p.dbs.workouts, 'db'], [`${p.name} – Weigh-ins`, p.dbs.weighins, 'db'],
          [`${p.name} – Current Routine`, p.pages.routine, 'page'], [`${p.name} – profile page`, p.pages.overview, 'page'],
        ]),
      ];
      const checks = {};
      for (const [name, id, kind] of targets) {
        try { await client.canRead(id, kind); checks[name] = 'ok'; } catch (err) { checks[name] = err.code || err.message || 'error'; }
      }
      const ok = Object.values(checks).every((v) => v === 'ok');
      return json({ ok, checks, version: env.APP_VERSION || null }, ok ? 200 : 503);
    }

    if (!(await isAuthenticated(env, request))) return json({ error: 'Not signed in' }, 401);

    if (parts[0] === 'session') {
      return json({ ok: true, authEnabled: authEnabled(env), mock: !!env.MOCK_NOTION });
    }
    if (parts[0] === 'people' && parts.length === 1) {
      return json(Object.values(PEOPLE).map(({ id, name, emoji }) => ({ id, name, emoji })));
    }

    if (!client) return json({ error: 'NOTION_TOKEN is not set. See README.' }, 500);

    if (parts[0] === 'meals' && method === 'GET') {
      const doc = await getDoc(client, SHARED.meals, url.searchParams.has('fresh'));
      return json({ ...parseMealsPage(doc.blocks, Object.values(PEOPLE)), fetchedAt: doc.fetchedAt });
    }

    // ---- /api/people/:person/... ----
    if (parts[0] !== 'people') return json({ error: 'Not found' }, 404);
    const person = PEOPLE[parts[1]];
    if (!person) return json({ error: 'Unknown person' }, 404);
    const [, , resource, id] = parts;
    const fresh = url.searchParams.has('fresh');

    if (resource === 'doc' && method === 'GET') {
      const pageId = person.pages[id];
      if (!pageId) return json({ error: 'Unknown page' }, 404);
      return json(await getDoc(client, pageId, fresh));
    }

    if (resource === 'routine' && method === 'GET') {
      const doc = await getDoc(client, person.pages.routine, fresh);
      return json({ ...parseRoutine(doc.blocks), fetchedAt: doc.fetchedAt });
    }

    if (resource === 'profile' && method === 'GET') {
      const doc = await getDoc(client, person.pages.overview, fresh);
      return json({ targets: parseTargets(doc.blocks) });
    }

    // Coach's Exercise Plan (read only): Active rows for this person.
    if (resource === 'plan' && method === 'GET') {
      const rows = await client.queryDatabase(SHARED.exercisePlan, {
        filter: { and: [{ property: 'Person', select: { equals: person.name } }, { property: 'Active', checkbox: { equals: true } }] },
        sorts: [{ property: 'Order', direction: 'ascending' }],
      });
      return json(planFromRows(rows));
    }

    // Set Log: every set this person has logged (newest first).
    if (resource === 'sets' && method === 'GET') {
      const rows = await client.queryDatabase(SHARED.setLog, {
        filter: { property: 'Person', select: { equals: person.name } },
        sorts: [{ property: 'Date', direction: 'descending' }],
      });
      return json(rows.map(setFromPage));
    }

    // Upsert one workout's sets: { sessionId, date, day, items: [{ key, pageId?, remove?, ...set }] }.
    // Existing rows are matched by Session ID, so saving twice never duplicates.
    if (resource === 'setlog' && method === 'POST') {
      const b = await request.json();
      if (!b.sessionId || !Array.isArray(b.items)) return json({ error: 'sessionId and items are required' }, 400);
      if (b.items.length > 40) return json({ error: 'Too many sets in one save' }, 400);
      const existing = await client.queryDatabase(SHARED.setLog, {
        filter: { and: [{ property: 'Session ID', rich_text: { equals: b.sessionId } }, { property: 'Person', select: { equals: person.name } }] },
      });
      const byId = new Map(existing.map((p) => [normId(p.id), p]));
      const byKey = new Map(existing.map((p) => { const x = setFromPage(p); return [`${x.exercise.toLowerCase()}|${x.set}`, p]; }));
      // Fill in the Exercise Plan link by name when the app didn't send one (e.g. older drafts).
      let planByName = null;
      if (b.items.some((it) => !it.remove && !it.planId)) {
        const rows = await client.queryDatabase(SHARED.exercisePlan, { filter: { property: 'Person', select: { equals: person.name } } }).catch(() => []);
        planByName = new Map(planFromRows(rows).count ? rows.map((r) => [plain(r.properties?.Exercise?.title || []).trim().toLowerCase(), r.id]) : []);
      }
      const saved = {}, removed = [], errors = [];
      for (const it of b.items) {
        if (!it.remove && !it.planId && planByName) it.planId = planByName.get(String(it.exercise || '').trim().toLowerCase()) || null;
        const match = (it.pageId && byId.get(normId(it.pageId))) || byKey.get(`${String(it.exercise || '').toLowerCase()}|${it.set}`);
        try {
          if (it.remove) {
            if (match) await client.archivePage(match.id);
            removed.push(it.key);
          } else {
            const props = setLogProps(person, b, it);
            const page = match ? await client.updatePage(match.id, props) : await client.createPage(SHARED.setLog, props);
            saved[it.key] = page.id;
          }
        } catch (err) {
          errors.push({ key: it.key, error: err.message });
        }
      }
      return json({ saved, removed, errors });
    }

    if (resource === 'workouts' && method === 'GET') {
      const rows = await client.queryDatabase(person.dbs.workouts, { sorts: [{ property: 'Date', direction: 'descending' }] });
      return json(rows.map(workoutFromPage));
    }
    if (resource === 'workouts' && method === 'POST') {
      const b = await request.json();
      const page = await client.createPage(person.dbs.workouts, workoutProps(person, b));
      return json(workoutFromPage(page), 201);
    }

    if (resource === 'workouts' && id && method === 'PATCH') {
      await assertOwned(client, person, id);
      const page = await client.updatePage(id, workoutProps(person, await request.json()));
      return json(workoutFromPage(page));
    }

    if (resource === 'weighins' && method === 'GET') {
      const rows = await client.queryDatabase(person.dbs.weighins, { sorts: [{ property: 'Date', direction: 'ascending' }] });
      return json(rows.map(weighinFromPage));
    }
    if (resource === 'weighins' && method === 'POST') {
      const b = await request.json();
      const page = await client.createPage(person.dbs.weighins, weighinProps(person, b));
      return json(weighinFromPage(page), 201);
    }

    if (resource === 'weighins' && id && method === 'PATCH') {
      await assertOwned(client, person, id);
      const page = await client.updatePage(id, weighinProps(person, await request.json()));
      return json(weighinFromPage(page));
    }

    if (resource === 'entries' && id && method === 'DELETE') {
      await assertOwned(client, person, id);
      await client.archivePage(id);
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    const status = err.code === 'object_not_found' ? 502 : err.status || 500;
    const hint = err.code === 'object_not_found' || err.code === 'unauthorized'
      ? ' Make sure the Notion integration is connected to the "Coach – Fitness & Nutrition" page.'
      : '';
    return json({ error: (err.message || 'Server error') + hint }, status >= 400 ? status : 500);
  }
}

// Only allow changing rows that live in this person's own log databases.
async function assertOwned(client, person, pageId) {
  const page = await client.retrievePage(pageId);
  const owned = Object.values(person.dbs).map(normId);
  if (!owned.includes(normId(page.parent?.database_id))) throw Object.assign(new Error('Not allowed'), { status: 403 });
}

async function getDoc(client, pageId, fresh) {
  const hit = docCache.get(pageId);
  if (!fresh && hit && Date.now() - hit.at < DOC_TTL_MS) return hit.value;
  const tree = await fetchBlockTree(client, pageId);
  const value = { blocks: simplifyBlocks(tree), fetchedAt: new Date().toISOString() };
  docCache.set(pageId, { at: Date.now(), value });
  return value;
}

// ---------- Notion property helpers ----------

function richText(str) {
  const s = String(str ?? '');
  if (!s) return { rich_text: [] };
  const chunks = [];
  for (let i = 0; i < s.length && chunks.length < 90; i += 1900) chunks.push({ text: { content: s.slice(i, i + 1900) } });
  return { rich_text: chunks };
}
const titleProp = (s) => ({ title: [{ text: { content: String(s || 'Workout').slice(0, 1900) } }] });
const numberProp = (n) => ({ number: n === '' || n == null || !Number.isFinite(Number(n)) ? null : Number(n) });
const dateProp = (d) => ({ date: { start: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10) } });

function workoutProps(person, b) {
  const exercisesText = Array.isArray(b.exercises) ? formatExercises(b.exercises) : String(b.exercisesText || '');
  const props = {
    Session: titleProp(b.session),
    Date: dateProp(b.date),
    'Exercises & sets/reps/weights': richText(exercisesText),
    Cardio: richText(b.cardio),
    Notes: richText(b.notes),
    'Duration min': numberProp(b.durationMin),
    'Energy/RPE': numberProp(b.rpe),
  };
  if (ROUTINE_BLOCK_OPTIONS.includes(b.block)) props['Routine Block'] = { select: { name: b.block } };
  if (person.agent) props.Agent = { select: { name: person.agent } };
  return props;
}

function weighinProps(person, b) {
  const props = {
    Name: titleProp(`Weigh-in ${b.date || ''}`.trim()),
    Date: dateProp(b.date),
    'Weight kg': numberProp(b.weight),
    'Waist cm': numberProp(b.waist),
    Notes: richText(b.notes),
  };
  if (person.agent) props.Agent = { select: { name: person.agent } };
  return props;
}

const prop = (page, name) => page.properties?.[name];
const textOf = (p) => (p ? plain(p.rich_text || p.title || []) : '');

function workoutFromPage(page) {
  const exercisesText = textOf(prop(page, 'Exercises & sets/reps/weights'));
  return {
    id: page.id,
    url: page.url,
    session: textOf(prop(page, 'Session')),
    date: prop(page, 'Date')?.date?.start || page.created_time?.slice(0, 10) || null,
    block: prop(page, 'Routine Block')?.select?.name || null,
    durationMin: prop(page, 'Duration min')?.number ?? null,
    rpe: prop(page, 'Energy/RPE')?.number ?? null,
    cardio: textOf(prop(page, 'Cardio')),
    notes: textOf(prop(page, 'Notes')),
    exercisesText,
    exercises: parseExercises(exercisesText),
  };
}

function weighinFromPage(page) {
  return {
    id: page.id,
    url: page.url,
    date: prop(page, 'Date')?.date?.start || page.created_time?.slice(0, 10) || null,
    weight: prop(page, 'Weight kg')?.number ?? null,
    waist: prop(page, 'Waist cm')?.number ?? null,
    notes: textOf(prop(page, 'Notes')),
  };
}
