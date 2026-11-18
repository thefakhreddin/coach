# Coach 🏋️

A small web app for Amir and Rozhin to follow their gym plans and log workouts. **Notion is the database.**

- **Today**: picks today's session from the Current Routine in Notion (Mon = Strength A, …). It lists each exercise with its target, what you lifted last time, and boxes for kg and reps. Tap ✓ to accept the suggested reps. Your entries are saved on the phone as you go, so a refresh at the gym loses nothing. **Save to Notion** adds a row to your Workout Log.
- **Plan**: your Current Routine, Diet Plan and profile page, read live from Notion. Tap ⟳ to reload them after Coach changes something.
- **History**: every logged session, with a link to open it in Notion and a Delete button.
- **Progress**: sessions this week, 7-day average weight, waist, a weigh-in form, a body-weight chart, estimated 1-rep max per exercise, and weekly training volume.

Each workout is written to the existing `Exercises & sets/reps/weights` column as readable text, one exercise per line:

```
Goblet squat: 20kg×10, 20kg×10, 22.5kg×8
Push-ups: BW×12, BW×10
Plank: 30s, 40s
```

The app reads this back for the charts, so rows Coach adds in Notion count too, as long as they follow roughly this format. No Notion columns were added or changed.

---

## 1. Create the Notion key (once, about 3 minutes)

1. Go to <https://www.notion.so/profile/integrations> and click **New integration**.
2. Name it `Coach app`, pick your workspace, type **Internal**. Save.
3. On the **Capabilities** tab, keep *Read content*, *Update content* and *Insert content* switched on.
4. Copy the **Internal Integration Secret** (it starts with `ntn_`).
5. In Notion, open the **🏋️ Coach – Fitness & Nutrition** page and click **•••** (top right), then **Connections**, then **Coach app**, then **Confirm**.
   The app can now see that page and everything under it (both people's pages, routines and logs), and nothing else.

## 2a. Host it online for free (recommended): Cloudflare Workers

Cost: **$0**. The free plan allows 100,000 requests a day, gives you an address like `https://coach.<your-name>.workers.dev`, and never sleeps.
A custom domain is optional (about $10/year from Cloudflare Registrar). You don't need one.

You need [Node.js](https://nodejs.org) 20 or newer on your computer.

```bash
git clone https://github.com/thefakhreddin/coach.git
```

```bash
cd coach && npm install
```

```bash
npx wrangler login
```

This opens the browser. Create a free Cloudflare account if you don't have one, then click **Allow**.

Next, set three secrets. Each command asks you to paste a value:

```bash
npx wrangler secret put NOTION_TOKEN
```

```bash
npx wrangler secret put APP_PASSWORD
```

```bash
npx wrangler secret put SESSION_SECRET
```

- `NOTION_TOKEN`: the `ntn_…` secret from step 1
- `APP_PASSWORD`: the password you and Rozhin will type to open the app (make it a long one)
- `SESSION_SECRET`: any long random text

```bash
npm run deploy
```

Wrangler prints your URL. Open it on your phone and add it to the home screen (step 3).
To update after code changes, run `git pull` and then `npm run deploy` again.

## 3. Put it on your iPhone home screen

1. Open your app URL in **Safari**. It has to be Safari: other browsers on iPhone can't install web apps the same way.
2. Tap **Share** (the square with the arrow), then **Add to Home Screen**, then **Add**.
3. Open **Coach** from the home screen and sign in.

It then opens full-screen like a normal app, with its own icon, light and dark mode, and room for the notch and home bar. It still opens with no signal, and a workout you haven't saved stays on the phone until you tap **Save to Notion**.
The home-screen app keeps its own login, separate from Safari, so you sign in once inside it. Rozhin does the same on her phone.

## 2b. Or run it on your own computer

```bash
cp .env.example .env
```

Edit `.env` and fill in `NOTION_TOKEN`, `APP_PASSWORD` and `SESSION_SECRET`, then start it:

```bash
npm start
```

Open <http://localhost:8787>. Phones on the same Wi-Fi can use `http://<your-computer's-IP>:8787`, but only while the computer is on. This is why the online option is more reliable.

## Try it without Notion

```bash
npm run demo
```

This runs on sample data and saves nothing to Notion.

## Tests

```bash
npm test
```

## How it fits together

| File | What it does |
|---|---|
| `src/config.js` | The Notion page and database IDs for each person. Update an ID here if a page is ever recreated. |
| `src/notion.js` | Notion API client. Turns Notion pages into simple blocks and parses the routine tables (Day A/B/C, the 30-minute and 45–60-minute versions, the weekly schedule). |
| `src/sets.js` | Reads and writes the `20kg×10` sets text. |
| `src/api.js` | The `/api/*` routes: plans, workouts, weigh-ins and login. |
| `worker.js` | Cloudflare entry point. |
| `server.js` | Local Node server (`npm start`). |
| `public/` | The phone-friendly front end. Plain HTML, CSS and JS, no build step. |

**Privacy:** the Notion key stays on the server and never reaches the browser. Every API call needs the password cookie, and the online version refuses to start without `APP_PASSWORD`.
