# YardObs

A mobile-first personal weather station dashboard that displays live observations, historical trends, and a 5-day forecast from your Weather Underground PWS.

## Features

- **Live observations** — temperature, feels-like, humidity, wind, pressure, dew point, UV index, solar radiation, and precipitation; auto-refreshes every 5 minutes
- **Trends tab** — hourly history charts for any past day, with lazy-loaded Recharts graphs
- **Forecast tab** — 5-day daily forecast fetched on demand via the TWC forecast API
- **Adaptive theming** — 6 CSS-variable themes (sunny, cloudy, rainy, stormy, light, dark) that switch automatically based on current conditions and time of day; manual override persisted in `localStorage`
- **Settings drawer** — theme preview for each condition, manual light/dark mode toggle

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + Vite 5 |
| Styling | Tailwind CSS v3 + custom CSS variables for theming |
| Charts | Recharts 2 |
| API proxy | Vercel Serverless Functions (Node.js) |
| Data source | The Weather Company (TWC) Personal Weather Station API |
| Deployment | Vercel |

## Project Structure

```
yardobs/
├── api/
│   └── weather.js        # Serverless proxy — keeps TWC_API_KEY server-side
├── src/
│   ├── App.jsx           # Root: theme resolution, tab routing, settings drawer
│   ├── components/
│   │   ├── TopBar.jsx    # Station ID + last-updated timestamp
│   │   ├── HeroCard.jsx  # Large current-temp display
│   │   ├── NavTabs.jsx   # Now / Trends / Forecast tab bar
│   │   ├── NowTab.jsx    # Full current-conditions detail grid
│   │   ├── TrendsTab.jsx # Hourly history charts (lazy-loaded)
│   │   ├── ForecastTab.jsx
│   │   └── SettingsDrawer.jsx
│   ├── hooks/
│   │   └── useWeather.js # Data fetching, polling, history cache
│   └── index.css         # CSS variable theme definitions
├── .env.example
├── vercel.json
└── vite.config.js
```

## Getting Started

### Prerequisites

- Node.js 18+
- A Weather Underground [PWS station ID](https://www.wunderground.com/pws/overview)
- A [TWC API key](https://docs.google.com/document/d/1eKCnKXI9xnoMGRRzOL1xPCBihNV2rOet08qpE_gArAY) (formerly Weather Underground API)

### Local development

```bash
# 1. Clone and install
git clone https://github.com/your-username/yardobs.git
cd yardobs
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set VITE_PWS_STATION_ID and TWC_API_KEY

# 3. Start dev server (Vite handles /api/* proxy via vercel dev, or use vercel dev directly)
npx vercel dev
```

> The `/api/weather` serverless function must run alongside the frontend to proxy TWC requests. Using `vercel dev` handles both together. Plain `npm run dev` will work for UI iteration but API calls will 404.

### Environment variables

| Variable | Where | Description |
|---|---|---|
| `VITE_PWS_STATION_ID` | `.env` / Vercel dashboard | Your PWS station ID (e.g. `KWASEATT123`). Safe to expose to the browser. |
| `TWC_API_KEY` | Vercel dashboard only | TWC API key. Never prefix with `VITE_` — stays server-side only. |

### Deploy to Vercel

```bash
vercel deploy --prod
```

Set `TWC_API_KEY` as an environment variable in the Vercel project dashboard (not in your repo). `VITE_PWS_STATION_ID` can be set there as well, or committed to `.env` since it is not sensitive.

## API Proxy

`api/weather.js` is a single Vercel serverless function that accepts a `type` query parameter and forwards the request to TWC, keeping the API key out of the browser.

| `type` | Required params | TWC endpoint |
|---|---|---|
| `current` | `stationId` | PWS current observation |
| `history` | `stationId`, `date` (YYYYMMDD) | PWS hourly history |
| `history-daily` | `stationId`, `date` (YYYYMMDD) | PWS daily history |
| `forecast` | `lat`, `lon` | 5-day daily forecast |

## Theming

Six themes are defined as CSS variable blocks on `body.theme-<name>` in [src/index.css](src/index.css). The active theme is resolved automatically from the TWC icon code and `isDay` flag, with a manual override stored in `localStorage` under `yardobs-mode`.

Because SVG chart attributes cannot consume CSS variables, resolved hex values for `--accent` and `--yoy` are mirrored in the `CHART_COLORS` map in [src/App.jsx](src/App.jsx) and passed as props to the Recharts components.
