import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotionClient } from '../src/notion.js';

test('retries when Notion rate-limits', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    if (calls < 3) return new Response('{}', { status: 429, headers: { 'retry-after': '0.01' } });
    return new Response(JSON.stringify({ results: [{ id: 'x' }], has_more: false }), { status: 200 });
  };
  const client = createNotionClient('t', fakeFetch);
  const rows = await client.listChildren('abc');
  assert.equal(rows.length, 1);
  assert.equal(calls, 3);
});

test('reports Notion errors clearly', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ code: 'object_not_found', message: 'Could not find block' }), { status: 404 });
  const client = createNotionClient('t', fakeFetch);
  await assert.rejects(client.listChildren('abc'), /Could not find block/);
});
