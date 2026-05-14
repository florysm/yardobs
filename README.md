# YardObs

A mobile-first personal weather station dashboard with AI-powered activity scoring and hyperlocal insights.

## What is this?

YardObs is a personal weather dashboard built around your own backyard weather station. Instead of checking a generic city forecast, it shows exactly what's happening at your location right now — temperature, wind, rain, air quality — and uses that data to score whether conditions are good for grilling, gardening, letting the dog out, or any other outdoor activity. It also remembers what the weather was doing a year ago today so you can see how this season compares.

All the sensitive API keys stay on the server. The browser only ever sees your station ID.

## Features

- **Live conditions** — temperature, feels-like, humidity, wind, pressure, dew point, UV index, solar radiation, and precipitation; auto-refreshes every 5 minutes
- **Activity Score** — 0–100 suitability score for 5 activities (BBQ & Smoking, Gardening, Sports & Recreation, Outdoor Leisure, Dog Walking), with a weighted factor breakdown and best time-of-day window
- **AI Insights** — Claude-generated daily backyard briefing and per-activity narrative, cached to minimize API calls
- **Trends** — hourly and daily charts for temperature, humidity, pressure, and precipitation across 24h / 7d / 30d ranges, with optional year-over-year overlay
- **5-day Forecast** — daily highs/lows and precipitation chance, plus an hourly scroll view grouped by day
- **Live Radar** — animated RainViewer radar tiles on an interactive Leaflet map with play/pause controls
- **Air Quality** — current AQI with plain-language label (Good, Moderate, etc.)
- **Adaptive Theming** — 6 themes (sunny, cloudy, rainy, stormy, light, dark) auto-selected from current conditions; manual override persisted in `localStorage`

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| UI framework | React 18 + Vite 5 | Mobile-first, 420px max-width |
| Styling | Tailwind CSS v3 + CSS variable themes | 6 condition-aware themes |
| Charts | Recharts 2 | Line charts with optional YoY overlay |
| Maps | Leaflet 1.9 + React-Leaflet 4 | RainViewer animated radar tiles |
| AI insights | Anthropic Claude API (`claude-sonnet-4-6`) | Activity + daily briefing, server-side only |
| Backend | Vercel Serverless Functions (Node.js) | `api/weather.js`, `api/insight.js` |
| Weather data | The Weather Company (TWC) PWS API | Current obs, history, 5-day forecast |
| Forecast / AQI | Open-Meteo (free, no key required) | Hourly forecast, air quality index |
| Deployment | Vercel | |

The frontend is a React SPA. Two Vercel serverless functions act as API proxies: `api/weather.js` keeps the TWC key server-side, and `api/insight.js` calls Claude without exposing the Anthropic key to the browser. Open-Meteo requests go through the same proxy for consistency but don't require a key.

## Project Structure

```
yardobs/
├── api/
│   ├── weather.js        # TWC + Open-Meteo proxy (keeps TWC_API_KEY server-side)
│   └── insight.js        # Claude AI insight engine (activity + daily briefings)
├── src/
│   ├── App.jsx           # Root: theme resolution, tab routing, settings drawer
│   ├── components/
│   │   ├── TopBar.jsx          # Station ID + live last-updated timestamp
│   │   ├── HeroCard.jsx        # Current temp hero; toggles to AI daily briefing
│   │   ├── NavTabs.jsx         # Now / Trends / Forecast / Radar tab bar
│   │   ├── NowTab.jsx          # Conditions detail grid + Activity Score Card
│   │   ├── ActivityScoreCard.jsx  # Scored activity picker with factor breakdown
│   │   ├── TrendsTab.jsx       # History charts with YoY overlay (lazy-loaded)
│   │   ├── ForecastTab.jsx     # 5-day + hourly forecast view
│   │   ├── RadarTab.jsx        # Animated radar map (lazy-loaded)
│   │   └── SettingsDrawer.jsx  # Theme picker + mode toggle
│   ├── hooks/
│   │   └── useWeather.js       # Data fetching, polling, caching
│   ├── utils/
│   │   ├── format.js           # Unit formatting helpers
│   │   └── weatherIcons.js     # Icon code → emoji/label mapping
│   └── index.css               # CSS variable theme definitions
├── .env.example
├── vercel.json
└── vite.config.js
```

## Getting Started

### Prerequisites

- Node.js 18+
- A Weather Underground [PWS station ID](https://www.wunderground.com/pws/overview)
- A [TWC API key](https://docs.google.com/document/d/1eKCnKXI9xnoMGRRzOL1xPCBihNV2rOet08qpE_gArAY) (formerly Weather Underground API)
- An [Anthropic API key](https://console.anthropic.com/) for AI insights

### Local Development

```bash
# 1. Clone and install
git clone https://github.com/your-username/yardobs.git
cd yardobs
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set VITE_PWS_STATION_ID, TWC_API_KEY, and ANTHROPIC_API_KEY

# 3. Start dev server
npx vercel dev
```

> The serverless functions in `api/` must run alongside the frontend to proxy API requests. `vercel dev` handles both together. Plain `npm run dev` works for UI iteration but API calls will 404.

### Environment Variables

| Variable | Where | Description |
|---|---|---|
| `VITE_PWS_STATION_ID` | `.env` / Vercel dashboard | Your PWS station ID (e.g. `KWASEATT123`). Safe to expose to the browser. |
| `TWC_API_KEY` | Vercel dashboard only | TWC API key. Never prefix with `VITE_` — stays server-side. |
| `ANTHROPIC_API_KEY` | Vercel dashboard only | Anthropic Claude key for insight generation. Server-side only. |

### Deploy to Vercel

```bash
vercel deploy --prod
```

Set `TWC_API_KEY` and `ANTHROPIC_API_KEY` as environment variables in the Vercel project dashboard (not in your repo). `VITE_PWS_STATION_ID` can be set there as well, or committed to `.env` since it is not sensitive.

## API Reference

### `GET /api/weather`

Proxies weather data requests, keeping `TWC_API_KEY` server-side. Accepts a `type` query parameter:

| `type` | Required params | Source | Returns |
|---|---|---|---|
| `current` | `stationId` | TWC | Live PWS observation |
| `history` | `stationId`, `date` (YYYYMMDD) | TWC | Hourly observations for a specific date |
| `history-recent` | `stationId` | TWC | Rolling 7-day hourly data |
| `history-daily` | `stationId`, `date` (YYYYMMDD) | TWC | Daily summary (high/low/precip) |
| `forecast` | `lat`, `lon` | TWC | 5-day daily forecast |
| `hourly-forecast` | `lat`, `lon` | Open-Meteo | Hourly forecast for the next ~48h |
| `air-quality` | `lat`, `lon` | Open-Meteo | Current AQI, PM2.5, PM10, ozone |

### `POST /api/insight`

Calls Claude to generate hyperlocal weather insights. Two modes via the `type` field:

**`type: 'activity'`** — evaluates current conditions for a specific outdoor activity and returns a short narrative with the key limiting factors.

**`type: 'daily'`** — generates a daily backyard briefing with a narrative summary and 3–4 tagged insight cards. Uses year-over-year data if available.

Caching: 30-minute in-memory TTL on the server (keyed by bucketed weather values to maximize reuse); 1-hour `localStorage` TTL on the client.

## Theming

Six themes are defined as CSS variable blocks on `body.theme-<name>` in [src/index.css](src/index.css). The active theme is resolved automatically from the TWC icon code (mapped to WMO weather codes), with fallbacks to sensor readings (precipitation rate, UV index, solar radiation, `isDay` flag). Manual override is stored in `localStorage` under `yardobs-mode`.

Because SVG chart attributes cannot consume CSS variables, resolved hex values for chart colors are mirrored in the `CHART_COLORS` map in [src/App.jsx](src/App.jsx) and passed as props to Recharts components.

## Documentation

- TWC API: https://docs.google.com/document/d/1eKCnKXI9xnoMGRRzOL1xPCBihNV2rOet08qpE_gArAY/edit?tab=t.0
- Open-Meteo: https://open-meteo.com/en/docs
- RainViewer Radar API: https://www.rainviewer.com/api.html
