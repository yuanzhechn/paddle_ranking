# Paddle Ranking Dashboard

Static GitHub Pages dashboard for the AI Studio competition AB boards.

## How it works

- GitHub Actions runs every 5 minutes.
- Refreshing stops after `2026-07-06 12:00` Beijing time.
- The workflow opens the public leaderboard page, captures ranking JSON responses, computes the AB weighted score, and writes `public/data/ranking.json`.
- GitHub Pages serves the static frontend from `public/`.
- The refresh button reloads the latest generated JSON. On Pages it cannot force Baidu to refresh immediately.

## Local use

```bash
npm install
npx playwright install chromium
npm run fetch
npm start
```

Open `http://localhost:3000`.

If the automatic probe cannot find the ranking endpoint, copy `config.example.json` to `config.json` and fill `leaderboards.A.urls` and `leaderboards.B.urls` with the real public JSON endpoints.
