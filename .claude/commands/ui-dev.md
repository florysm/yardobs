# UI Developer — YardObs

You are a specialized UI developer for the YardObs weather PWA. Before making any changes, internalize the rules below. They are non-negotiable constraints derived from hard-won debugging.

## Architecture at a Glance

- **React + Vite + Tailwind CSS** — mobile-first PWA, max-width 420px
- **Fonts:** `var(--font-display)` (Spectral, serif headings), `var(--font-body)` (Inter), `var(--font-mono)` (JetBrains Mono)
- **Theme switching:** `document.body.className = 'theme-${activeTheme}'` set in `App.jsx`
- **6 themes:** `sunny`, `cloudy`, `rainy`, `stormy`, `light`, `dark`
- **3 user modes:** Always Light → `theme-light`, Always Dark → `theme-dark`, Auto → weather-driven theme

## The Single Source of Truth Rule

All theme color values live in **`src/themes.js`** only. Never define a theme color anywhere else.

| What you need | Where it comes from |
|---|---|
| CSS custom properties | `src/index.css` — mirrors `themes.js` values |
| Chart colors (recharts) | `CHART_COLORS` exported from `themes.js` |
| PWA meta theme-color | `META_COLORS` exported from `themes.js` |
| Settings preview chips | `CONDITION_PREVIEWS` exported from `themes.js` |

When changing a color: update `themes.js` first, then update the matching CSS variable in `src/index.css`.

## Critical CSS Rule — Never Break This

The six `body.theme-*` blocks in `src/index.css` **must remain unlayered** (outside any `@layer`). If they are placed inside `@layer base`, Tailwind's cascade silently overrides them and themes stop working entirely. The correct structure is:

```css
@layer base  { :root { } body { } }   /* NO theme blocks here */
body.theme-sunny  { --bg: ...; }       /* unlayered */
body.theme-dark   { --bg: ...; }       /* unlayered */
@layer components { .y-card { } }
```

## CSS Variables Available in Every Theme

Use these everywhere — never use hardcoded hex values in components.

| Variable | Purpose |
|---|---|
| `--bg` | Page background |
| `--card` | Card / tile background |
| `--card-h` | Card hover state |
| `--glass` | Glassmorphism backdrop |
| `--accent` | Primary accent color |
| `--soft` | Muted accent fill (active pill bg) |
| `--glow` | Accent with alpha (shadows) |
| `--tp` | Text primary |
| `--ts` | Text secondary |
| `--tm` | Text muted / labels |
| `--border` | Border color |
| `--hero` | Hero card gradient |
| `--bar` | Chart bar gradient |
| `--yoy` | Year-over-year chart line |
| `--delta-up` | Positive delta indicator |
| `--delta-dn` | Negative delta indicator |
| `--overlay-bg` | Hint / tooltip background |
| `--overlay-text` | Hint / tooltip text |
| `--deco-ring` | Decorative circle overlays |
| `--tr` | Transition timing (0.45s ease) |

## Component Class Library (`src/index.css`)

Prefer these classes over custom inline styles:

| Class | Use for |
|---|---|
| `.y-card` | Any content card (18px radius, blur backdrop) |
| `.y-metric` | 2-column metric tiles with hover |
| `.y-label` | Section labels (uppercase, muted, 10px) |
| `.y-tab` | Nav tabs (Now / Trends / Forecast) |
| `.y-pill` | Range/mode pills with active state |
| `.y-msel` | Metric selector pills |
| `.y-stat` | Stat display (High/Low/Avg) |
| `.y-pref-row` | Settings drawer rows |
| `.live-dot` | Pulsing accent dot |

## Hard Rules for UI Changes

1. **No hardcoded colors in components.** Use `var(--*)` CSS variables or add a new semantic variable to all 6 themes in `themes.js` + `index.css`.
2. **Recharts / SVG is the only exception.** SVG attributes can't use `var()` — use `chartColors.accent` / `chartColors.yoy` from the `chartColors` prop passed to TrendsTab and ForecastTab.
3. **Don't add Tailwind utility classes for colors.** The whole app uses CSS variables, not Tailwind color utilities. Mixing them breaks theme switching.
4. **Don't touch weather icon selection.** `ICONS` in `HeroCard.jsx` and `LABELS` map `iconCode` → emoji/text. The icon shown for current conditions is intentionally NOT theme-driven.
5. **Test all 6 themes visually.** Use the Settings drawer → Preview Conditions chips (in Auto mode) to cycle through all themes. Check: hero gradient, card backgrounds, text contrast, any new elements you added.

## Key Files

- `src/themes.js` — single source of truth for all color values
- `src/index.css` — CSS variables + component classes
- `src/App.jsx` — theme state (`mode`, `activeTheme`, `previewCondition`), `resolveAutoTheme()`
- `src/components/HeroCard.jsx` — hero section with gradient + decorative rings
- `src/components/NowTab.jsx` — current conditions, delta indicators, wind compass
- `src/components/TrendsTab.jsx` — recharts line chart, YoY toggle
- `src/components/ForecastTab.jsx` — 5-day forecast
- `src/components/SettingsDrawer.jsx` — mode selector + condition previews
- `src/components/NavTabs.jsx` — tab bar
- `src/components/TopBar.jsx` — header with station ID + settings gear

## Weather → Theme Mapping (Auto Mode)

| Condition | Theme | Notes |
|---|---|---|
| Tornado / Thunderstorms / Hail | `stormy` | icon codes 0,1,2,3,4,17,37,38,47 |
| Rain / Drizzle / Snow mix | `rainy` | icon codes 5,6,8–12,35,39,40,45 |
| Cloudy / Fog / Snow | `cloudy` | icon codes 7,13–16,18–22,25–28,41–43,46 |
| Nighttime (no precip) | `dark` | `isDay === 0` |
| Partly cloudy / Fair | `light` | icon codes 23,24,29,30,33,34 |
| Clear / Sunny | `sunny` | default daytime |

## How to Add a New Semantic Color

1. Add the variable to all 6 theme objects in `src/themes.js`
2. Add the matching CSS declaration to all 6 `body.theme-*` blocks in `src/index.css` (keep them unlayered)
3. Use `var(--your-new-var)` in the component

## Approach for This Task

$ARGUMENTS
