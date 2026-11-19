# Coach 🏋️

A small web app for Amir and Rozhin to follow their gym plans and log workouts. **Notion is the database.**

Pick **Amir** or **Rozhin** at the top. The tabs at the bottom are the same for both of you:

- **Today**: a weigh-in box (just type your weight; it saves itself), today's workout at a glance, today's calories, protein, carbs and fat with a pie chart, and your meals in time order with the next one highlighted.
- **Gym**: today's workout opens by itself (Mon = Strength A, …), showing each exercise's target and what you lifted last time. Type kg and reps, or tap ✓ to accept the suggested reps. **Everything saves to Notion automatically** a moment after you stop typing. With no signal, it keeps your entries on the phone and syncs when you're back online.
- **Kitchen**: today or tomorrow. It shows what to cook and portion for both of you (eggs, grams of chicken, cups of rice…), the prep steps on Sunday and Wednesday, a pie chart of your protein sources, and a carbs/protein/fat pie for each meal.
- **Progress**: weight with a 7-day trend, waist, strength per exercise (heaviest weight, reps, estimated 1-rep max), weekly volume, and recent sessions (with delete).
- **Week**: the whole week at a glance. Tap a day to see its workout and meals.

Meals come from the **Shared Meals & Prep** page in Notion. Calories and protein are Coach's numbers; carbs and fat are estimated from typical values for each food (`src/meals.js`).

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

Next, set three secrets. In Git Bash, put the value straight into the command, because Git Bash can't answer wrangler's prompts:

```bash
echo "PASTE_NOTION_KEY" | npx wrangler secret put NOTION_TOKEN
```

```bash
echo "YOUR_APP_PASSWORD" | npx wrangler secret put APP_PASSWORD
```

```bash
echo "any-long-random-text" | npx wrangler secret put SESSION_SECRET
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
| `src/meals.js` | Reads the meal tables and prep steps from Shared Meals & Prep, and estimates carbs and fat. |
| `src/sets.js` | Reads and writes the `20kg×10` sets text. |
| `src/api.js` | The `/api/*` routes: plans, workouts, weigh-ins and login. |
| `worker.js` | Cloudflare entry point. |
| `server.js` | Local Node server (`npm start`). |
| `public/` | The phone-friendly front end. Plain HTML, CSS and JS, no build step. |

**Privacy:** the Notion key stays on the server and never reaches the browser. Every API call needs the password cookie, and you sign in once per phone (it lasts about a year). The online version refuses to start without `APP_PASSWORD` unless you set `NO_PASSWORD = "yes"` in `wrangler.toml`. That isn't recommended: anyone with the URL could then read your logs and add or delete rows in your Notion.
