# Changelog

All notable changes to YardObs are listed here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.3.0] - 2026-07-07

### Added
- Added a Units setting (°F/mph/inches or °C/km/h/mm) that's automatically detected from your device's language and region, with a manual override in Settings — used throughout current conditions, the activity score, forecasts, trends, and AI-generated insights.
- Time displays (sunrise/sunset, hourly forecast, "updated" timestamps) now automatically follow your device's 12-hour or 24-hour clock preference instead of always showing AM/PM.

### Fixed
- Fixed an issue where saving or updating your weather station connection wouldn't reliably start pulling in live data until the app was reloaded.

## [1.2.1] - 2026-06-11

### Fixed
- Weather icons in the hourly forecast now better reflect actual conditions — a rain icon won't appear when there's only a small chance of precipitation
- Tapping the location search field on iPhone no longer triggers the screen zoom
- Fixed a memory leak in the AI insights service where expired cache entries were never cleared, causing the service to slow down over time

### Changed
- Hourly forecast now uses Open-Meteo (global multi-model ensemble, includes UV index) instead of NOAA/NWS as the primary source — more reliable for non-US locations and restores UV index data in the hourly view

## [1.2.0] - 2026-06-09

### Added
- Hourly forecast now uses NOAA / National Weather Service as the primary source for US locations — NWS data is better at capturing convective events. Open-Meteo remains the fallback for non-US locations or when NWS is unavailable.
- Year-over-year rainfall comparison is now available in the 30-day Trends view (previously limited to 24h and 7d)

### Fixed
- Sun and Moon rise/set times in the Forecast tab now use on-device SunCalc calculations instead of API-provided values, eliminating a class of incorrect times
- Selecting a location in Preview Mode now dismisses the keyboard on mobile
- Backdrop blur on the settings button now renders correctly in Safari (added `-webkit-backdrop-filter`)

### Changed
- The Conditions / Insights toggle on the home card no longer remembers your last choice — it always opens on Conditions

## [1.1.2] - 2026-06-08

### Fixed
- The Trends tab now shows the "connect your weather station" screen again when no station is configured, instead of a generic error

## [1.1.1] - 2026-06-08

### Fixed
- Hourly forecast cards no longer overlap on iPhone — a Safari layout quirk caused cards to collide when scrolling through overnight hours
- Today's daily forecast card now shows the correct weather icon instead of a thermometer when the daytime forecast period has already passed
- Today's high temperature now stays accurate throughout the day: shows the projected high until the current temperature exceeds it, then tracks the live reading, and locks to the day's recorded peak once temperatures start dropping

## [1.1.0] - 2026-06-05

### Added
- Tap any day in the 7-day forecast to see an AI-generated outlook for that day — what conditions will feel like and what to plan for

### Fixed
- Preview mode now shows the correct nighttime theme when skies are clear at night (previously used the daytime sunny theme)
- The hourly forecast strip now scrolls and lays out correctly on narrow screens instead of breaking layout
- Radar tab now shows an error message if radar data fails to load, instead of staying blank

## [1.0.0] - 2026-06-04

### Added
- Year-over-year comparison in Trends now works on the 7-day view, not just 24 hours; the 30-day view shows the toggle as disabled with an explanation tooltip
- Location search shows a brief checkmark confirmation after you pick a location
- Weather stations without solar or UV sensors now get a supplemental sky-condition reading from a forecast model so the app theme reflects actual conditions

### Fixed
- The Now tab now shows a clear error card if weather data fails to load, instead of displaying the loading skeleton indefinitely
- AI daily insight now waits for forecast data before generating — previously it could produce a summary with missing rain/precipitation context on first load
- Quickly switching to the Insights view no longer fires overlapping AI requests
- The weather API now times out after 10 seconds instead of hanging when the upstream service is slow or unreachable
- Station-mode users without a station ID configured now see an explanatory message instead of a blank screen
- Preview-mode users with no location set now see an explanatory message instead of a blank screen
- The Activity card no longer shows an empty space when weather data hasn't loaded yet — it now shows a "Waiting for weather data…" label
- Error responses from the weather API now surface the actual message rather than a generic HTTP status code
- Partly-cloudy conditions now correctly switch to the Sunny theme when UV or solar radiation is high
- Caught component errors are now logged to the browser console for easier debugging

### Changed
- Settings and Changelog drawers now declare themselves as dialogs for screen readers (role="dialog", aria-modal, aria-label)
- Chart and score-ring elements now carry accessible labels for screen readers
- Keyboard focus rings are now consistently styled using the app's accent colour across all browsers
- Trends chart loading state is now a smooth pulsing skeleton instead of plain text
- Preview mode now fetches current conditions, hourly forecast, and daily forecast in a single request — reducing load time and round trips
- Air quality data now loads directly from Open-Meteo for all modes
- API error messages are now forwarded to the client instead of being replaced with a generic HTTP status string

## [0.6.0] - 2026-06-03

### Added
- Precipitation chart now shows as a bar chart in 7-day and 30-day views — easier to spot daily rainfall amounts at a glance
- Temperature chart in 7-day and 30-day views now shows a daily High/Low band instead of a single line, so you can see how much the temperature swung each day

### Fixed
- Outdoor Activity pills on the home card now lay out correctly (3+2) on iPhone instead of wrapping to an extra row (2+2+1)
- Your personal weather station now correctly shows "Sunny" on clear days — stations without a UV sensor could never reach "Sunny" before; it now uses solar radiation as the primary signal

### Changed
- README updated with step-by-step instructions for installing YardObs to your home screen as a PWA on iOS, Android, and desktop

## [0.5.0] - 2026-06-02

### Added
- New "Found a bug? Report it" button in the Changelog modal — describe the issue and click to open a pre-filled GitHub report with your app version, station, and browser info already attached

### Fixed
- AI insights on the home card were hard to read in light themes (Sunny, Cloudy, Light) — text is now correctly colored for each theme
- Today's forecast card now shows your station's actual recorded high temperature instead of a blank value
- Date lookups could show the wrong day in the evening when your local date differs from UTC — all date handling now uses your local time zone
- Hourly forecast tiles could get squished when scrolling — each tile now holds its minimum width correctly
- Isolated crashes in individual tabs so they no longer take down the whole app

### Changed
- AI insights now update up to 4 times a day (morning, afternoon, evening, night) with time-of-day context, so the insight you get at 9am reflects morning conditions and the one at 6pm reflects evening conditions
- "7-Day Forecast" section renamed to "Daily Forecast"

## [0.4.1] - 2026-06-01

### Changed
- Added contributor documentation and improved the project README

## [0.4.0] - 2026-06-01

### Fixed
- Fixed a crash on the Forecast tab that could occur before your location was fully determined
- Fixed the year-over-year comparison in Trends so leap-year dates (Feb 29) correctly map to Feb 28 in non-leap years instead of rolling to March 1

### Changed
- Connecting your weather station now tests the connection before saving — if your station ID or API key is wrong, you'll see a specific error message right away instead of silently failing
- Settings now includes a direct link to Weather Underground where you can get your free API key
- Refreshed the onboarding screen copy to more clearly explain what the app does and how to connect your own weather station
- Weather data now refreshes at slightly randomized intervals when multiple browser tabs are open, reducing simultaneous server hits
- Improved keyboard and screen-reader accessibility across the navigation tabs and activity selector
- The weather API now returns clearer, human-readable error messages when a station ID or API key is invalid, and enforces per-user rate limits to protect the service

## [0.3.0] - 2026-06-01

### Added
- "Support YardObs" in Settings is now a live link to Ko-fi — tap the coffee cup to buy me a coffee ♥

### Fixed
- Forecast section now correctly shows "7-Day Forecast" instead of "5-Day Forecast"

### Changed
- Settings simplified — removed the option to change your preview location or switch back to preview mode from within the drawer

## [0.2.0] - 2026-06-01

### Added
- In-app version badge in Settings — tap it to read the full changelog
- Preview mode lets anyone explore the app without owning a weather station
- Location search when setting up in preview or station mode
- Automated release workflow for future updates

### Fixed
- Radar overlay now renders correctly
- Neighborhood display labels on the radar view are accurate

### Changed
- Sign-in flow simplified — streamlined account setup and removed the previous complex authentication screen

## [0.1.0] - 2026-05-01

### Added
- Initial release of YardObs
- Personal Weather Station (PWS) integration via Weather Company Data API
- Live conditions dashboard with temperature, humidity, wind, UV, and solar data
- Forecast tab with hourly and daily outlooks
- Trends tab with historical charts
- Radar tab with interactive map overlay
- Activity Score Card with personalized condition ratings
- Dynamic weather-based theming (sunny, cloudy, rainy, stormy, light, dark)
- Light, dark, and auto display modes
- Preview mode for non-PWS owners to explore the app
- Multi-user support with Supabase authentication
