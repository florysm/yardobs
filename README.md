# YardObs

![version](https://img.shields.io/badge/version-0.4.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![node](https://img.shields.io/badge/node-18%2B-brightgreen) [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fflorysm%2Fyardobs)

A mobile-first personal weather station dashboard with AI-powered activity scoring and hyperlocal insights.

## What is this?

YardObs is a personal weather dashboard built around your own backyard weather station. Instead of checking a generic city forecast, it shows exactly what's happening at your location right now — temperature, wind, rain, air quality — and uses that data to score whether conditions are good for grilling, gardening, letting the dog out, or any other outdoor activity. It also remembers what the weather was doing a year ago today so you can see how this season compares.

All the sensitive API keys stay on the server. The browser only ever sees your station ID.

> **No weather station? No problem.** Use [Preview Mode](#option-a--preview-mode-no-weather-station-required) to explore the full app with any location — no API keys or hardware required.

## Live Demo

**[yardobs.vercel.app](https://yardobs.vercel.app)** — open in Preview Mode to try it without a personal weather station.

## Features

- **Live Conditions** — temperature, feels-like, humidity, wind, pressure, dew point, UV index, solar radiation, and precipitation; auto-refreshes every 5 minutes
- **Activity Score** — 0–100 suitability score for 5 activities (BBQ & Smoking, Gardening, Sports & Recreation, Outdoor Leisure, Dog Walking), with a weighted factor breakdown and best time-of-day window
- **AI Insights** — Claude-generated daily backyard briefing and per-activity narrative, cached to minimize API calls
- **Trends** — hourly and daily charts for temperature, humidity, pressure, and precipitation across 24h / 7d / 30d ranges, with optional year-over-year overlay
- **5-day Forecast** — daily highs/lows and precipitation chance, plus an hourly scroll view grouped by day
- **Live Radar** — animated RainViewer radar tiles on an interactive Leaflet map with play/pause controls
- **Air Quality** — current AQI with plain-language label (Good, Moderate, etc.)
- **Adaptive Theming** — 6 themes (sunny, cloudy, rainy, stormy, light, dark) auto-selected from current conditions; manual override persisted in `localStorage`
- **Preview Mode** — explore with any location without owning a personal weather station
- **In-app Changelog** — version history accessible from the settings drawer
- **Location Search** — geocoding via Open-Meteo to find any location for preview or comparison

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
│   │   ├── TopBar.jsx              # Station ID + live last-updated timestamp
│   │   ├── HeroCard.jsx            # Current temp hero; toggles to AI daily briefing
│   │   ├── NavTabs.jsx             # Now / Trends / Forecast / Radar tab bar
│   │   ├── NowTab.jsx              # Conditions detail grid + Activity Score Card
│   │   ├── ActivityScoreCard.jsx   # Scored activity picker with factor breakdown
│   │   ├── TrendsTab.jsx           # History charts with YoY overlay (lazy-loaded)
│   │   ├── ForecastTab.jsx         # 5-day + hourly forecast view
│   │   ├── RadarTab.jsx            # Animated radar map (lazy-loaded)
│   │   ├── SettingsDrawer.jsx      # Theme picker, station setup, changelog viewer
│   │   ├── LocationSetup.jsx       # Onboarding: station ID entry or preview mode
│   │   ├── LocationSearchInput.jsx # Geocoding search for preview mode
│   │   ├── ChangelogModal.jsx      # In-app changelog viewer
│   │   ├── MetricCard.jsx          # Reusable single-metric display card
│   │   ├── TrendsLockedPlaceholder.jsx  # "Connect a station to unlock trends"
│   │   └── ErrorBoundary.jsx       # React error boundary
│   ├── hooks/
│   │   └── useWeather.js           # Data fetching, polling, caching
│   ├── utils/
│   │   ├── activities.js           # Activity definitions and scoring weights
│   │   ├── apiFetch.js             # HTTP client with error handling
│   │   ├── format.js               # Unit formatting helpers
│   │   ├── geocode.js              # Location search via Open-Meteo Geocoding API
│   │   ├── parseChangelog.js       # Changelog parser for the in-app modal
│   │   ├── storageKeys.js          # localStorage key constants
│   │   └── weatherIcons.js         # WMO code → emoji/label mapping
│   └── index.css                   # CSS variable theme definitions
├── .env.example
├── vercel.json
└── vite.config.js
```

## Getting Started

### Option A — Preview Mode (no weather station required)

Visit [yardobs.vercel.app](https://yardobs.vercel.app) and choose **Preview Mode** at the prompt — type any city name and explore the full UI with forecast, radar, and activity scoring. No API keys or hardware needed.

To run Preview Mode locally, you only need `ANTHROPIC_API_KEY` (for AI insights) — `TWC_API_KEY` and `VITE_PWS_STATION_ID` are optional.

### Option B — Your Own Weather Station

To connect your own [Weather Underground PWS](https://www.wunderground.com/pws/overview) station you'll also need:

- A TWC API key (see below)
- Your PWS station ID (e.g. `KWASEATT123`)

### Getting a TWC API Key

YardObs uses The Weather Company (TWC) PWS API to access your station's live readings and historical data. Access is tied to a free Weather Underground account.

1. Create or log in to your account at [wunderground.com](https://www.wunderground.com)
2. Navigate to [wunderground.com/member/api-keys](https://www.wunderground.com/member/api-keys)
3. Generate a new API key
4. Add it to your `.env` file as `TWC_API_KEY`, or set it as an Environment Variable in your Vercel project dashboard

> `TWC_API_KEY` must never be prefixed with `VITE_` — it stays server-side and is never exposed to the browser.

### Fork and Run Locally

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/florysm/yardobs.git
cd yardobs
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — see the Environment Variables table below

# 3. Start dev server (runs frontend + serverless functions together)
npx vercel dev
```

> Plain `npm run dev` works for UI iteration but API calls will 404 — the serverless functions in `api/` require `vercel dev` to run alongside the frontend.

### Environment Variables

| Variable | Where | Description |
|---|---|---|
| `VITE_PWS_STATION_ID` | `.env` / Vercel dashboard | Your PWS station ID (e.g. `KWASEATT123`). Safe to expose to the browser. Optional — leave blank to use Preview Mode. |
| `TWC_API_KEY` | `.env` / Vercel dashboard | TWC API key. Never prefix with `VITE_` — stays server-side. Optional in Preview Mode. |
| `ANTHROPIC_API_KEY` | Vercel dashboard only | Anthropic Claude key for AI insight generation. Server-side only. |

### Deploy Your Own Instance to Vercel

1. Fork the repo on GitHub
2. Click the **Deploy to Vercel** button at the top of this README, or import your fork in the Vercel dashboard
3. Set `TWC_API_KEY` and `ANTHROPIC_API_KEY` as Environment Variables (Production) in the Vercel project settings — never commit these to the repo
4. Optionally set `VITE_PWS_STATION_ID` if you want to pre-seed your station ID
5. Deploy — done

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards.

## Sponsor

If YardObs is useful to you, you can support the project on [Ko-fi](https://ko-fi.com/yardobs). No pressure — it's a free hobby project and always will be.

## Acknowledgments

- [The Weather Company PWS API](https://docs.google.com/document/d/1eKCnKXI9xnoMGRRzOL1xPCBihNV2rOet08qpE_gArAY) — real-time personal weather station data
- [Open-Meteo](https://open-meteo.com) — free, open-source weather forecast and air quality API
- [RainViewer](https://www.rainviewer.com/api.html) — animated global radar tiles
- [Anthropic Claude](https://www.anthropic.com) — AI-powered weather insights

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.