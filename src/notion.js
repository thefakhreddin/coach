// Small Notion API client plus helpers that turn Notion blocks into simple JSON.

import { parseRecommendation } from './sets.js';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

export function createNotionClient(token, fetchImpl = fetch) {
  async function call(method, path, body, attempt = 0) {
    const res = await fetchImpl(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // Notion allows ~3 requests/second; back off and retry when it says "slow down".
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 400 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 5000)));
      return call(method, path, body, attempt + 1);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || `Notion API error ${res.status}`);
      err.status = res.status;
      err.code = data.code;
      throw err;
    }
    return data;
  }

  return {
    async listChildren(blockId) {
      const all = [];
      let cursor;
      do {
        const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
        const data = await call('GET', `/blocks/${blockId}/children${q}`);
        all.push(...data.results);
        cursor = data.has_more ? data.next_cursor : null;
      } while (cursor);
      return all;
    },
    async queryDatabase(dbId, body = {}) {
      const all = [];
      let cursor;
      do {
        const data = await call('POST', `/databases/${dbId}/query`, {
          page_size: 100,
          ...body,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        all.push(...data.results);
        cursor = data.has_more && all.length < 1000 ? data.next_cursor : null;
      } while (cursor);
      return all;
    },
    createPage(dbId, properties) {
      return call('POST', '/pages', { parent: { database_id: dbId }, properties });
    },
    // One cheap request to check the integration can read a database or page.
    async canRead(id, kind) {
      if (kind === 'db') await call('POST', `/databases/${id}/query`, { page_size: 1 });
      else await call('GET', `/blocks/${id}/children?page_size=1`);
      return true;
    },
    retrievePage(pageId) {
      return call('GET', `/pages/${pageId}`);
    },
    updatePage(pageId, properties) {
      return call('PATCH', `/pages/${pageId}`, { properties });
    },
    archivePage(pageId) {
      return call('PATCH', `/pages/${pageId}`, { archived: true });
    },
  };
}

// ---------- Blocks -> simple JSON ----------

const NESTED = new Set(['toggle', 'table', 'column_list', 'column', 'callout', 'bulleted_list_item',
  'numbered_list_item', 'to_do', 'quote', 'synced_block', 'heading_1', 'heading_2', 'heading_3']);

// Fetch a page's blocks with nested children (tables, toggles, lists), up to `depth` levels.
export async function fetchBlockTree(client, blockId, depth = 4) {
  const blocks = await client.listChildren(blockId);
  if (depth > 0) {
    await Promise.all(blocks.map(async (b) => {
      if (b.has_children && NESTED.has(b.type)) {
        b.children = await fetchBlockTree(client, b.id, depth - 1);
      }
    }));
  }
  return blocks;
}

export function simplifyRichText(rich = []) {
  return rich.map((r) => {
    const seg = { t: r.plain_text ?? r.text?.content ?? '' };
    const a = r.annotations || {};
    if (a.bold) seg.b = 1;
    if (a.italic) seg.i = 1;
    if (a.code) seg.c = 1;
    if (a.strikethrough) seg.s = 1;
    if (r.href && /^https?:/.test(r.href)) seg.href = r.href;
    if (r.type === 'mention' && r.mention?.type === 'date' && r.mention.date?.start) seg.date = r.mention.date.start.slice(0, 10);
    return seg;
  });
}

export function plain(rich = []) {
  return rich.map((r) => r.plain_text ?? r.text?.content ?? r.t ?? '').join('');
}

export function simplifyBlocks(blocks = []) {
  const out = [];
  for (const b of blocks) {
    const v = b[b.type] || {};
    const node = { type: b.type };
    if (v.rich_text) node.text = simplifyRichText(v.rich_text);
    if (b.type === 'to_do') node.checked = !!v.checked;
    if (b.type === 'callout' && v.icon?.emoji) node.icon = v.icon.emoji;
    if (b.type === 'child_page') node.text = [{ t: v.title }];
    if (b.type === 'child_database') node.text = [{ t: v.title }];
    if (b.type === 'table') {
      node.header = !!v.has_column_header;
      node.rows = (b.children || [])
        .filter((r) => r.type === 'table_row')
        .map((r) => r.table_row.cells.map(simplifyRichText));
    } else if (b.children) {
      node.children = simplifyBlocks(b.children);
    }
    if (['divider', 'table'].includes(b.type) || node.text || node.children) out.push(node);
  }
  return out;
}

// ---------- Routine page -> structured plan ----------

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function cellText(cell) {
  return plain(cell).trim();
}

// Parse "3 × 8–12", "2 × 8–10 / leg", "3 × 20–45 sec"
// timed: false | 'sec' | 'min'
export function parseTarget(text) {
  const t = String(text || '');
  const m = t.match(/(\d+)\s*[x×]\s*([\d]+)(?:\s*[–-]\s*(\d+))?\s*(sec|s\b|min)?/i);
  if (!m) {
    // "5–8 min" (a machine block, no sets): one timed entry in minutes.
    const mm = t.match(/^\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*(min|sec)/i);
    if (mm) return { sets: 1, repsLow: Number(mm[1]), repsHigh: Number(mm[2] || mm[1]), timed: mm[3].toLowerCase() === 'min' ? 'min' : 'sec', perSide: false };
    return { sets: null, repsLow: null, repsHigh: null, timed: false, perSide: false };
  }
  return {
    sets: Number(m[1]),
    repsLow: Number(m[2]),
    repsHigh: m[3] ? Number(m[3]) : Number(m[2]),
    timed: m[4] ? (m[4].toLowerCase() === 'min' ? 'min' : 'sec') : false,
    perSide: /\/\s*(leg|side|arm)/i.test(t),
  };
}

// Walk the simplified blocks of a "Current Routine" page and pull out:
//  - block name ("Block 1") from the first text that mentions it
//  - weekly schedule (Mon -> Strength A ...)
//  - strength days: { A: { title, versions: { "30 minutes": [exercises], ... } } }
export function parseRoutine(blocks) {
  const result = { block: null, blockStart: null, schedule: [], days: {}, cardio: [] };
  let h2 = '';
  let h3 = '';

  const visit = (list) => {
    for (const b of list) {
      const text = b.text ? plain(b.text).trim() : '';
      if (!result.block && text) {
        const m = text.match(/\bBlock\s+(\d+)/i);
        if (m) {
          result.block = `Block ${m[1]}`;
          result.blockStart = b.text.find((seg) => seg.date)?.date || null; // first date = block start
        }
      }
      // Coach's cardio guidance: short paragraphs/bullets under a "Cardio ..." heading.
      if (/cardio|walk/i.test(h2) && !/^Day\s/i.test(h2) && ['paragraph', 'bulleted_list_item', 'numbered_list_item'].includes(b.type)
        && text && !text.startsWith('|') && !text.startsWith('\\|') && result.cardio.length < 4) result.cardio.push(text);
      if (b.type === 'heading_1' || b.type === 'heading_2') { h2 = text; h3 = ''; }
      else if (b.type === 'heading_3') h3 = text;
      else if (b.type === 'table' && b.rows?.length) {
        const rows = b.rows.map((r) => r.map(cellText));
        const header = b.header ? rows[0].map((c) => c.toLowerCase()) : [];
        const body = b.header ? rows.slice(1) : rows;
        const dayMatch = h2.match(/^Day\s+([A-Z])\b/i);
        if (/schedule/i.test(h2)) {
          for (const r of body) {
            const day = DAYS.find((d) => r[0]?.toLowerCase().startsWith(d.toLowerCase()));
            if (day) result.schedule.push({ day, session: r[1] || '', short: r[2] || '' });
          }
        } else if (dayMatch) {
          const letter = dayMatch[1].toUpperCase();
          const day = (result.days[letter] ||= { letter, title: h2, versions: {} });
          // Columns: exercise, one or more targets ("Sets × reps (Wk 1–2)", "Wk 3+"), Coach's
          // per-person "Recommended" weight/reps, and a note.
          const targetCols = header.map((h, i) => ({ h, i })).filter(({ h, i }) => i > 0 && (/set|rep/.test(h) || /^wk|week/.test(h)) && !/recommend|suggest/.test(h))
            .map(({ h, i }) => ({ i, from: Number(h.match(/(?:wk|week)\s*(\d+)/)?.[1] || 1) }));
          if (!targetCols.length) targetCols.push({ i: 1, from: 1 });
          const iRec = header.findIndex((h) => /recommend|suggest|target (weight|load)/.test(h));
          let iNote = header.findIndex((c) => c.includes('note'));
          if (iNote < 0 && !b.header) iNote = 2;
          const version = h3 || 'Workout';
          day.versions[version] = body.filter((r) => r[0]).map((r) => {
            const targets = targetCols.map(({ i, from }) => ({ from, target: r[i] || '', ...parseTarget(r[i]) }));
            const recommended = iRec > 0 ? r[iRec] || '' : '';
            return {
              name: r[0],
              ...targets[0],
              targets,
              note: iNote > 0 ? r[iNote] || '' : '',
              recommended,
              rec: parseRecommendation(recommended),
            };
          });
        }
      }
      if (b.children && b.type !== 'table') visit(b.children);
    }
  };
  visit(blocks);
  return result;
}

// Which routine day ("A") is planned for a weekday ("Mon")?
export function sessionForDay(routine, dayName) {
  const entry = routine.schedule.find((s) => s.day === dayName);
  if (!entry) return { kind: 'unknown', label: '' };
  const m = entry.session.match(/Strength\s+([A-Z])\b/i) || entry.session.match(/Day\s+([A-Z])\b/i);
  if (m && routine.days[m[1].toUpperCase()]) return { kind: 'strength', letter: m[1].toUpperCase(), label: entry.session };
  if (/walk|cardio|bike|run/i.test(entry.session)) return { kind: 'cardio', label: entry.session };
  if (/rest/i.test(entry.session)) return { kind: 'rest', label: entry.session };
  return { kind: 'other', label: entry.session };
}
