// Cloudflare Workers entry point: /api/* goes to the API, everything else is a static file.
import { handleApi } from './src/api.js';
import { createNotionClient } from './src/notion.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!env.APP_PASSWORD) {
        return new Response(JSON.stringify({ error: 'APP_PASSWORD secret is not set; refusing to run unprotected online.' }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }
      const client = env.NOTION_TOKEN ? createNotionClient(env.NOTION_TOKEN) : null;
      return handleApi(request, env, client);
    }
    return env.ASSETS.fetch(request);
  },
};
