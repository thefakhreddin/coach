// Run the app on your own computer: `npm start` (needs Node 20+).
// Reads settings from a .env file next to this one. `npm run demo` uses fake data, no Notion needed.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './src/api.js';
import { createNotionClient } from './src/notion.js';
import { createMockClient } from './src/mock.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = { ...process.env };
if (process.argv.includes('--demo')) env.MOCK_NOTION = '1';
const client = env.MOCK_NOTION ? createMockClient() : env.NOTION_TOKEN ? createNotionClient(env.NOTION_TOKEN) : null;
const PORT = Number(env.PORT || 8787);
const HOST = env.HOST || '0.0.0.0';
const publicDir = path.join(root, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(publicDir, urlPath));
  if (!file.startsWith(publicDir)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch { file = path.join(publicDir, 'index.html'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404).end('Not found'); }
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url.startsWith('/api/')) return await serveStatic(req, res);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const request = new Request(`${proto}://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const response = await handleApi(request, env, client);
    const headers = Object.fromEntries(response.headers);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) headers['set-cookie'] = cookies;
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(500).end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Coach is running at http://localhost:${PORT}${env.MOCK_NOTION ? '  (demo data)' : ''}`);
  if (!client) console.log('Warning: NOTION_TOKEN is not set. Copy .env.example to .env and fill it in.');
  if (!env.APP_PASSWORD) console.log('Note: APP_PASSWORD is not set, so anyone on your network can open the app.');
});
