# Feature Developer — YardObs

You are implementing a data-driven feature for the YardObs weather PWA. Follow the workflow below exactly — the sequence matters because API constraints shape every design decision.

---

## Workflow

### 1. API Audit First (always)

Before touching any component, read the relevant docs in `docs/TWCAPIDocs/`. Understand:
- What fields are available (and what's missing — e.g., no `pressureAvg`, only `pressureMax`/`pressureMin`)
- Response envelope key: hourly history returns `{ observations: [...] }`, daily summary returns `{ observations: [...] }` (not `summaries`)
- Date range constraints: `history/daily` and `history/hourly` accept `startDate`/`endDate` up to 31 days
- Which endpoints support historical date targeting vs. only rolling windows

### 2. Trace the Existing Data Flow

Map the full path before proposing new code:

```
TWC API → api/weather.js (serverless route) → useWeather.js (hook) → App.jsx (props) → component
```

**API route** (`api/weather.js`): `type` param switches between `current`, `history`, `history-recent`, `history-daily`, `forecast`

**Hook** (`src/hooks/useWeather.js`) — existing fetch functions:
| Function | Endpoint | Caches? | Response key |
|---|---|---|---|
| `fetchHistory(dateStr)` | `/v2/pws/history/hourly?date=` | state by YYYYMMDD | `observations` |
| `fetchHistoryRecent()` | `/v2/pws/observations/hourly/7day` | no (always fresh) | `observations` |
| `fetchHistoryDaily(dateStr)` | `/v2/pws/history/daily?date=` | ref-cache (stable callback) | `observations` |
| `fetchForecast()` | `/v3/wx/forecast/daily/5day` | state once | raw |

**Field locations** — same across all history endpoints:
- Temperature: `imperial.tempAvg` / `tempHigh` / `tempLow`
- Humidity: `humidityAvg` (top-level, NOT in `imperial`)
- Pressure: `imperial.pressureMax` / `pressureMin`
- Rainfall: `imperial.precipTotal` (cumulative from midnight); `imperial.precipRate` (instantaneous)

### 3. Check for Reusable Patterns

Look for these before writing new code:

| Pattern | Where | Use for |
|---|---|---|
| `DeltaCell` component | `NowTab.jsx` | Any "this value vs. last year" comparison |
| `mergeHourly(obs)` | `TrendsTab.jsx` | Normalize hourly API obs → `{time, temp, humidity, pressure, precip}` |
| `mergeDay(o)` | `TrendsTab.jsx` | Same for daily summary obs |
| `toDateStr(date)` | `useWeather.js` (exported) | Date → `YYYYMMDD` key |
| `addDays(date, n)` | `TrendsTab.jsx` | Date arithmetic |
| `lyKey` / `lyYesterdayKey` | `TrendsTab.jsx` | Pre-computed "365 days ago" keys |
| `fetchHistoryDaily` ref-cache | `useWeather.js` | Stable callback; safe in `useEffect` deps |
| `historyDailyRef` deduplication | `useWeather.js` | Prevents duplicate fetches for same date |
| `stats(arr)` | `TrendsTab.jsx` | `{high, low, avg}` from a value array |

### 4. Enter Plan Mode

Use Plan Mode for any change touching data fetching, new state, or new components. Launch parallel Explore agents for codebase research. Ask the user clarifying questions about UX before writing the plan — don't assume choices about what to show, when to show it, or how to handle loading states.

### 5. Implement

- Minimize file count — prefer adding to existing components over creating new ones
- Lazy-fetch new data (trigger on user action or metric selection, not on mount)
- Add `// eslint-disable-next-line react-hooks/exhaustive-deps` with an explanation when intentionally omitting array deps that are stable by value
- Follow all UI dev rules (CSS variables, no hardcoded colors, `var(--delta-up)` / `var(--delta-dn)` for deltas)

---

## Key Files

| File | Role |
|---|---|
| `docs/TWCAPIDocs/` | TWC API reference — read this first |
| `api/weather.js` | Serverless proxy — add new `type` cases here if needed |
| `src/hooks/useWeather.js` | All data fetching and state |
| `src/App.jsx` | Hook wiring; passes props to tab components |
| `src/components/NowTab.jsx` | Current conditions; `DeltaCell` YoY pattern |
| `src/components/TrendsTab.jsx` | Historical charts; merge helpers, stats, bar charts |
| `src/components/ForecastTab.jsx` | 5-day forecast display |

---

## UI Constraints (inherit from ui-dev)

- All colors via `var(--*)` — never hardcoded hex
- Recharts/SVG only: use `chartColors.accent` / `chartColors.yoy` props (SVG can't use `var()`)
- No Tailwind color utilities — app uses CSS variables exclusively
- If you need a new color, add it to all 6 themes in `src/themes.js` + all 6 `body.theme-*` blocks in `src/index.css` (keep theme blocks **unlayered** — outside any `@layer`)
- Component classes: `.y-card`, `.y-label`, `.y-stat`, `.y-pill`, `.y-metric`, `.y-msel`

---

## Task

$ARGUMENTS
