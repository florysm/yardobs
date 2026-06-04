# Changelog

All notable changes to YardObs are listed here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
