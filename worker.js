// Cloudflare Workers entry point: /api/* goes to the API, everything else is a static file.
import { handleApi } from './src/api.js';
import { createNotionClient } from './src/notion.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // Online, a password is required unless you explicitly opt out with NO_PASSWORD = "yes".
      if (!env.APP_PASSWORD && env.NO_PASSWORD !== 'yes') {
        return new Response(JSON.stringify({ error: 'Set the APP_PASSWORD secret, or set NO_PASSWORD = "yes" in wrangler.toml to run without one.' }), {
          status: 500, headers: { 'Content-Type': 'application/json' },
        });
      }
      const client = env.NOTION_TOKEN ? createNotionClient(env.NOTION_TOKEN) : null;
      return handleApi(request, env, client);
    }
    // Static files (search engines are kept out by robots.txt and the page's robots meta tag).
    return env.ASSETS.fetch(request);
  },
};
