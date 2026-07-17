# YardObs

![version](https://img.shields.io/badge/version-1.4.0-blue) ![license](https://img.shields.io/badge/license-MIT-green) ![node](https://img.shields.io/badge/node-18%2B-brightgreen) [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fflorysm%2Fyardobs)

A mobile-first personal weather station dashboard with AI-powered activity scoring and hyperlocal insights.

## What is this?

YardObs is a personal weather dashboard built around your own backyard weather station. Instead of checking a generic city forecast, it shows exactly what's happening at your location right now — temperature, wind, rain, air quality — and uses that data to score whether conditions are good for grilling, gardening, letting the dog out, or any other outdoor activity. It also remembers what the weather was doing a year ago today so you can see how this season compares.

The Anthropic key stays on the server. Your TWC station key is stored only in your own browser and sent straight through to The Weather Company — it is never committed, never bundled, and never shared with other users.

> **No weather station? No problem.** Use [Preview Mode](#option-a--preview-mode-no-weather-station-required) to explore the full app with any location — no API keys or hardware required.

## Live Demo

**[yardobs.app](https://yardobs.app)** — open in Preview Mode to try it without a personal weather station.

## Installing YardObs

YardObs is a **Progressive Web App (PWA)** — you can install it directly to your phone's home screen and use it like a native app, with no app store required.

**iOS (Safari)**
1. Open [yardobs.app](https://yardobs.app) in Safari
2. Tap the Share button (the box with an arrow pointing up) at the bottom of the screen
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

**Android (Chrome)**
1. Open [yardobs.app](https://yardobs.app) in Chrome
2. Tap the three-dot menu in the top-right corner
3. Tap **Add to Home Screen** or **Install App**
4. Tap **Add**

**Desktop (Chrome or Edge)**
1. Open [yardobs.app](https://yardobs.app)
2. Click the install icon (⊕) in the address bar on the right
3. Click **Install**

> YardObs is designed mobile-first and feels native on a phone home screen. Desktop works well too, but the experience is optimized for a narrow viewport.

## Features

- **Live Conditions** — temperature, feels-like, humidity, wind, pressure, dew point, UV index, solar radiation, and precipitation; auto-refreshes every 5 minutes
- **Severe Weather Alerts** — active NWS alerts appear as a colored banner at the top of the dashboard; tap to read the full alert text, timing, and safety instructions; refreshes every 5 minutes
- **Activity Score** — 0–100 suitability score for 5 activities (BBQ & Smoking, Gardening, Sports & Recreation, Outdoor Leisure, Dog Walking), with a weighted factor breakdown and best time-of-day window
- **AI Insights** — Claude-generated daily backyard briefing and per-activity narrative, cached to minimize API calls
- **Trends** — hourly and daily charts for temperature, humidity, pressure, and precipitation across 24h / 7d / 30d ranges, with optional year-over-year overlay
- **5-day Forecast** — daily highs/lows and precipitation chance, plus an hourly scroll view grouped by day
- **Live Radar** — animated RainViewer radar tiles on an interactive Leaflet map with play/pause controls
- **Air Quality** — current AQI with plain-language label (Good, Moderate, etc.)
- **Units & Locale** — imperial (°F / mph / in) or metric (°C / km/h / mm) auto-detected from your device's region, with a manual override in Settings; time displays follow your device's 12h or 24h clock preference
- **Adaptive Theming** — 6 themes (sunny, cloudy, rainy, stormy, light, dark) auto-selected from current conditions using your station's rain gauge as ground truth; manual override persisted in `localStorage`
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
| AI insights | Anthropic Claude API (`claude-haiku-4-5`) | Activity, daily briefing, forecast-day; server-side only |
| Backend | Vercel Serverless Functions (Node.js) | `api/weather.js`, `api/insight.js` |
| Weather data | The Weather Company (TWC) PWS API | Current obs, history, 5-day forecast |
| Hourly forecast | Open-Meteo (free, no key required) | Global hourly forecast (5 days) plus a daily block, works for any location worldwide |
| Air quality | Open-Meteo (free, no key required) | Current AQI, PM2.5, PM10, ozone, plus 5 days of hourly AQI |
| Weather alerts | NOAA / NWS (free, no key required) | US severe-weather alerts |
| Sun position | SunCalc | Derives day/night from coordinates for reliable night theming |
| Deployment | Vercel | |

The frontend is a React SPA. Two Vercel serverless functions act as API proxies: `api/weather.js` forwards the caller's own TWC key upstream, and `api/insight.js` calls Claude without exposing the Anthropic key to the browser. Open-Meteo requests also go through the same proxy for consistency (and are also called directly from the browser in a couple of places); it doesn't require a key.

## Project Structure

```
yardobs/
├── api/
│   ├── weather.js        # TWC + Open-Meteo + NWS proxy (forwards the caller's own TWC key)
│   ├── insight.js        # Claude AI insight engine (activity + daily briefings)
│   └── lib/
│       ├── cors.js       # Origin allowlist + OPTIONS preflight
│       ├── sanitize.js   # Request body size clamping (prevents token inflation)
│       └── validate.js   # Pure validators for coords, station IDs, dates
├── src/
│   ├── App.jsx           # Root: theme resolution, tab routing, settings drawer
│   ├── themes.js         # Single source of truth for all theme color values
│   ├── components/
│   │   ├── TopBar.jsx              # Station ID + live last-updated timestamp
│   │   ├── HeroCard.jsx            # Current temp hero; toggles to AI daily briefing
│   │   ├── NavTabs.jsx             # Now / Trends / Forecast / Radar tab bar
│   │   ├── NowTab.jsx              # Conditions detail grid + Activity Score Card
│   │   ├── ActivityScoreCard.jsx   # Scored activity picker with factor breakdown
│   │   ├── AlertBar.jsx            # Active severe-weather alert banner
│   │   ├── AlertsSheet.jsx         # Full alert detail sheet (tap-to-expand)
│   │   ├── TrendsTab.jsx           # History charts with YoY overlay (lazy-loaded)
│   │   ├── ForecastTab.jsx         # 5-day + hourly forecast view
│   │   ├── RadarTab.jsx            # Animated radar map (lazy-loaded)
│   │   ├── SettingsDrawer.jsx      # Theme picker, station setup, changelog viewer
│   │   ├── LocationSetup.jsx       # Onboarding: station ID entry or preview mode
│   │   ├── LocationSearchInput.jsx # Geocoding search for preview mode
│   │   ├── ChangelogModal.jsx      # In-app changelog viewer
│   │   ├── MetricCard.jsx          # Reusable single-metric display card
│   │   ├── TrendsLockedPlaceholder.jsx  # "Connect a station to unlock trends"
│   │   └── ErrorBoundary.jsx       # React error boundary (supports reload)
│   ├── hooks/
│   │   └── useWeather.js           # Data fetching, polling, caching, alert fetch
│   ├── utils/
│   │   ├── activities.js           # Activity definitions and scoring weights
│   │   ├── alerts.js               # NWS alert normalization + severity helpers
│   │   ├── apiFetch.js             # HTTP client with error handling
│   │   ├── dateUtils.js            # Date helpers (toISODate, getTimePeriod, etc.)
│   │   ├── forecastNormalize.js    # TWC/Open-Meteo forecast shapes → one internal format
│   │   ├── format.js               # Display formatting helpers
│   │   ├── geocode.js              # Location search via Open-Meteo Geocoding API
│   │   ├── insightVocab.js         # Shared score/AQI/time-of-day wording for prompts and UI
│   │   ├── parseChangelog.js       # Changelog parser for the in-app modal
│   │   ├── scoring.js              # Activity scoring engine (unit-testable)
│   │   ├── storageKeys.js          # localStorage key constants
│   │   ├── units.js                # Imperial/metric conversion + locale detection
│   │   ├── weatherCalc.js          # Feels-like, dew point, and related calculations
│   │   └── weatherIcons.js         # WMO code → emoji/label mapping
│   └── index.css                   # CSS variable theme definitions + component classes
├── .env.example
├── vercel.json
└── vite.config.js
```

## Getting Started

### Option A — Preview Mode (no weather station required)

Visit [yardobs.app](https://yardobs.app) and choose **Preview Mode** at the prompt — type any city name and explore the full UI with forecast, radar, and activity scoring. No API keys or hardware needed.

To run Preview Mode locally, you only need `ANTHROPIC_API_KEY` (for AI insights) — `VITE_PWS_STATION_ID` is optional. Preview Mode is served entirely by [Open-Meteo](https://open-meteo.com), which needs no API key.

### Option B — Your Own Weather Station

To connect your own [Weather Underground PWS](https://www.wunderground.com/pws/overview) station you'll also need:

- A TWC API key (see below)
- Your PWS station ID (e.g. `KWASEATT123`)

### Getting a TWC API Key

YardObs uses The Weather Company (TWC) PWS API to access your station's live readings and historical data. Access is tied to a free Weather Underground account.

1. Create or log in to your account at [wunderground.com](https://www.wunderground.com)
2. Navigate to [wunderground.com/member/api-keys](https://www.wunderground.com/member/api-keys)
3. Generate a new API key
4. Enter it in **Settings → Station** in the app

> Your key is stored in your own browser and sent to `api/weather.js` as the `x-twc-key` header, which forwards it to The Weather Company. It is never committed, never bundled, and never shared with other users. There is deliberately no server-side fallback key: Preview Mode uses Open-Meteo instead, so anonymous traffic can't spend someone else's TWC quota.

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
| `ANTHROPIC_API_KEY` | Vercel dashboard only | Anthropic Claude key for AI insight generation. Server-side only. |

> There is no `TWC_API_KEY` environment variable. Station owners supply their own key in **Settings → Station**; Preview Mode needs no key at all.

### Deploy Your Own Instance to Vercel

1. Fork the repo on GitHub
2. Click the **Deploy to Vercel** button at the top of this README, or import your fork in the Vercel dashboard
3. Set `ANTHROPIC_API_KEY` as an Environment Variable (Production) in the Vercel project settings — never commit it to the repo
4. Optionally set `VITE_PWS_STATION_ID` if you want to pre-seed your station ID
5. Deploy — done

## API Reference

### `GET /api/weather`

Proxies weather data requests. TWC routes require the caller's own key via the `x-twc-key` header; Open-Meteo and NWS routes need no key, which is what lets Preview Mode run unauthenticated.

| `type` | Required params | Source | Key | Returns |
|---|---|---|---|---|
| `current` | `stationId` | TWC | ✅ | Live PWS observation |
| `history` | `stationId`, `date` (YYYYMMDD) | TWC | ✅ | Hourly observations for a specific date |
| `history-recent` | `stationId` | TWC | ✅ | Rolling 7-day hourly data |
| `history-daily` | `stationId`, `date` (YYYYMMDD) | TWC | ✅ | Daily summary (high/low/precip) |
| `forecast` | `lat`, `lon` | TWC | ✅ | 5-day daily forecast. Station owners only — Preview Mode reads its daily forecast from the `daily` block of `hourly-forecast` instead. |
| `hourly-forecast` | `lat`, `lon` | Open-Meteo | — | Global hourly forecast (5 days) **plus** a `daily` block (max/min, weather code, precip probability). Works for any location worldwide. |
| `hourly-forecast-twc` | `lat`, `lon` | TWC | ✅ | TWC hourly forecast (alternate source; no current caller) |
| `air-quality` | `lat`, `lon` | Open-Meteo | — | Current AQI, PM2.5, PM10, ozone, **plus** an `hourly` block of `us_aqi` covering 5 days (used for per-day air quality on the Forecast tab) |
| `alerts` | `lat`, `lon` | NWS | — | Active severe-weather alerts (US only; returns empty array outside NWS coverage) |

### `POST /api/insight`

Calls Claude to generate hyperlocal weather insights. Three modes via the `type` field:

**`type: 'activity'`** (the default when no `type` is given) — evaluates current conditions for a specific outdoor activity and returns a short narrative with the key limiting factors.

**`type: 'daily'`** — generates a daily backyard briefing with a narrative summary and 3–4 tagged insight cards. Uses year-over-year data if available.

**`type: 'forecast-day'`** — describes a single day from the 5-day forecast, using that day's hourly temperature curve, rain window, and air quality.

Caching: 30-minute in-memory TTL on the server (keyed by bucketed weather values to maximize reuse); 1-hour `localStorage` TTL on the client.

## Theming

Six themes are defined as CSS variable blocks on `body.theme-<name>` in [src/index.css](src/index.css). The active theme is resolved automatically using a sensor-aware cascade: your station's rain gauge is treated as ground truth (a dry reading vetoes a model storm), day/night is derived from your coordinates via SunCalc, and measured solar/UV data determines sunny vs. cloudy. Manual override is stored in `localStorage` under `yardobs-mode`.

All theme color values (CSS hex values, chart palette, PWA meta theme-color, settings preview chips) live in [src/themes.js](src/themes.js) as the single source of truth. [src/index.css](src/index.css) mirrors them as CSS custom properties. Because SVG chart attributes cannot consume CSS variables, resolved hex values for chart colors are exported as `CHART_COLORS` from `themes.js` and passed as props to Recharts components.

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
