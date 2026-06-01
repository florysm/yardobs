# Location-Based Weather Mode First Draft

## Summary

YardObs is feasible to expand from a personal-weather-station dashboard into a broader location-based weather app. The main blocker is architectural, not visual: the app currently treats `VITE_PWS_STATION_ID` as the root input, then derives `lat/lon` from the PWS current-observation response. Without a station, current conditions, forecasts, AQI, radar, insights, and trends do not have a location source.

The recommended direction is to support two data modes:

- `station`: existing PWS behavior, preserving current owner-focused experience.
- `location`: new non-PWS mode using saved or browser-detected `lat/lon`, city label, and forecast/current-condition APIs.

## Key Changes

- Add a first-class weather profile model:
  - `mode: "station" | "location"`
  - `stationId` for PWS users
  - `lat`, `lon`, `label` for location users
  - Persist profile in `localStorage`, with env defaults as fallback.
- Refactor `useWeather(stationId)` into a source-aware hook, likely `useWeather(profile)`.
  - In station mode, keep existing PWS current/history behavior.
  - In location mode, fetch current conditions, hourly forecast, daily forecast, AQI, and radar from `lat/lon` directly.
  - Do not require PWS current observation before forecast/AQI/radar can load.
- Extend `/api/weather`.
  - Keep existing PWS endpoints unchanged.
  - Add a location-current endpoint, likely using Open-Meteo or a TWC geocode/current-conditions endpoint.
  - Normalize upstream responses into one internal shape so components do not care whether data came from PWS or location mode.
- Update UI copy and behavior.
  - Replace station-only labels like "Your Station," "PWS Observations API," and "your live station data" with source-aware labels.
  - In location mode, show city/location name in `TopBar` and settings.
  - Add onboarding/settings controls for "Use my location" and "Enter location manually."
- Adjust feature availability.
  - `Now`, `Forecast`, `Radar`, activity scoring, AQI, and AI insights should work in both modes.
  - `Trends` and year-over-year PWS history should remain station-only for v1 unless a separate historical-weather provider is added.
  - In location mode, replace Trends with a clear empty state or a forecast-based "Outlook" variant rather than showing broken historical charts.
- Update AI insights.
  - Rename prompts from "backyard/station" to source-aware "local conditions."
  - Omit year-over-year comparisons in location mode unless historical data exists.
  - Include forecast-derived rain risk when live rain-rate/precip-total fields are unavailable.

## Public Interfaces

Frontend profile shape:

```js
{
  mode: "station" | "location",
  stationId?: string,
  lat?: number,
  lon?: number,
  label?: string
}
```

Normalized current-condition shape should keep existing fields where possible:

```js
{
  temp,
  feelsLike,
  humidity,
  windSpeed,
  windGust,
  windDir,
  pressure,
  dewPoint,
  precipRate,
  precipTotal,
  uv,
  solar,
  iconCode,
  isDay,
  lat,
  lon,
  sourceType,
  sourceLabel,
  obsTimeLocal
}
```

`/api/weather` should continue supporting existing `type=current/history/history-recent/history-daily/forecast/hourly-forecast/air-quality`, plus a new location-current path such as `type=current-location&lat=&lon=`.

## Test Plan

- Station mode still loads current conditions, history, forecast, AQI, radar, activity scores, and AI insights with an existing `VITE_PWS_STATION_ID`.
- Location mode with saved `lat/lon` loads current conditions without any station ID.
- Location mode can open Forecast and Radar before any PWS data exists.
- Location mode hides or replaces Trends without API errors.
- Settings can switch between station and location profiles and persists the choice.
- Empty/error states cover denied geolocation, missing location, failed upstream weather fetch, and absent optional metrics like solar or precip total.
- Run `npm run build` and manually verify mobile layout for both modes.

## Assumptions

- v1 should preserve the existing PWS experience and add location mode alongside it, not replace station mode.
- v1 location mode does not need historical trends unless a historical-weather provider is explicitly selected.
- Browser geolocation is optional; manual location entry should be supported so users can use the app without granting location permission.
- Existing Open-Meteo forecast/AQI usage can remain, but the exact current-conditions provider should be validated before implementation.
