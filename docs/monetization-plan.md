# YardObs Monetization Plan

First draft: May 8, 2026

This document captures an initial monetization plan for YardObs, informed by the current app overview in `README.md`, the multi-user production plan in `docs/multi-user-production-planning.md`, and initial research into Weather Company / Weather Underground API limits and commercial pricing.

The goal is not to force YardObs into a subscription-first model. The goal is to identify revenue paths that are appropriate for a focused Personal Weather Station dashboard, can cover operating costs, and do not create avoidable API, support, or platform risk.

## Product Context

YardObs is currently a mobile-first PWA-style dashboard for Personal Weather Station data. It shows:

- Live observations
- Historical trends
- A 5-day forecast
- Adaptive weather/time-based themes
- User settings

The current app assumes one deployment, one station, and one TWC API key. The production plan shifts YardObs toward a multi-user model where each authenticated user brings their own Weather Underground / TWC PWS API key and station ID.

This matters for monetization because YardObs should initially monetize the dashboard experience, hosting, sharing, and convenience around the data rather than reselling weather data directly.

## Initial Positioning

YardObs should not be positioned as a generic consumer weather app. That market is crowded, hard to differentiate, and usually ad/subscription-heavy.

The stronger positioning is:

```txt
A polished, mobile-first dashboard for people and organizations that care about a specific Personal Weather Station.
```

Likely early audiences:

- Weather hobbyists
- Backyard gardeners and growers
- Small farms
- Garden clubs and community gardens
- Schools and STEM programs
- Neighborhood groups
- Property/facility owners
- Marinas, wineries, golf courses, parks, or trail centers

These users are more likely to value station-specific weather, history, public sharing, and presentation quality.

## Cost Baseline

The rough production cost estimate from `multi-user-production-planning.md` is:

```txt
Early production:
Vercel Pro:      ~$20/month
Supabase Free:   $0/month
Domain:          ~$10-$25/year

More serious production:
Vercel Pro:      ~$20/month
Supabase Pro:   ~$25/month
Domain:          ~$10-$25/year
```

This means early break-even is likely around `$20-$45/month`, before optional services such as monitoring, analytics, transactional email, or billing infrastructure.

That low cost baseline gives YardObs room to use a user-friendly revenue model instead of immediately forcing a subscription wall.

## TWC / Weather Underground API Findings

There appear to be two relevant API access models.

### PWS Contributor / Weather Underground API Keys

Multiple third-party and community sources consistently cite these practical limits for Weather Underground PWS-style API keys:

```txt
~1,500 calls/day per key
~10-30 calls/minute per key
```

The exact current official limit was not found in a clean current TWC source during initial research, so YardObs should design conservatively around:

```txt
1,500 calls/day
10 calls/minute
```

Planning implications:

- Current weather every 5 minutes while open is reasonable.
- Current weather every 1 minute can consume almost an entire daily quota.
- Multiple open tabs, multiple devices, public pages, and background polling can exhaust a user's key.
- Forecast and history calls should be cached aggressively.
- Public or shared dashboards must not call TWC once per visitor.

### Commercial TWC Weather Data API

Current public TWC commercial pricing reviewed on May 8, 2026:

```txt
Free trial:
30 days
50,000 API calls/day
100 API calls/minute

Standard:
Annual
1 million API calls/month
$500/month

Enterprise:
Custom
```

Official TWC documentation also indicates that API keys are entitled for specific packages/endpoints. Access is not just based on call volume. For example:

- Daily forecasts may require entitlement for 3, 5, 7, 10, or 15 day endpoints.
- Hourly forecasts may require entitlement for 2-day or 15-day endpoints.
- Richer products such as air quality, agriculture indices, severe weather, lightning, imagery, and historical data may require specific packages.

This makes a YardObs-owned commercial TWC plan a later-stage option, not an MVP dependency.

Sources reviewed:

- https://developer.weather.com/docs/authentication
- https://www.weathercompany.com/weather-data-apis/weather-data-apis-packages-pricing/
- https://developer.weather.com/docs/openapi/daily-forecast-3-0-1
- https://developer.weather.com/docs/openapi/hourly-forecasts-3-0
- https://developer.weather.com/docs/standard-weather-data-package
- https://www.mypws.de/knowledgebase.php?article=6
- https://community.homey.app/t/app-pro-weather-underground-pws-app-release-4-0-4-test-4-0-6/26309
- https://www.skypack.dev/view/weather-underground-node

## Monetization Principles

1. Keep the private core useful.
2. Avoid a subscription-only posture for individual hobbyists.
3. Charge for ongoing hosted value when there are ongoing costs.
4. Charge organizations more than individuals.
5. Do not resell TWC data unless the license explicitly supports it.
6. Avoid API-heavy paid promises until caching, quota controls, and licensing are clear.
7. Prefer PWA distribution first. App stores add cost, policy overhead, commissions, and release friction.

## Recommended Initial Model

### Free

Target user:

- Individual PWS owner or hobbyist trying YardObs privately.

Included:

- BYO TWC / Weather Underground API key
- One private station
- Current observations
- Basic trends
- 5-day forecast where the user's key supports it
- Adaptive themes
- PWA install
- Active-view polling only

Guardrails:

- Default current-weather refresh should remain around 5 minutes.
- No background polling when the user is not actively using the app.
- Cache forecast and history responses.
- Show clear quota/rate-limit errors.

### Supporter

Suggested pricing:

```txt
$19-$29 one time
```

Target user:

- Individual user who likes the app and wants a better personal dashboard without another subscription.

Potential features:

- Multiple saved stations
- Advanced chart views
- Historical comparison views
- CSV export
- Image export for charts/current conditions
- More themes and layout customization
- Saved local reports generated from cached data
- Subtle supporter personalization

API posture:

- Prefer features that add value without significantly increasing upstream TWC calls.
- Multiple stations should have explicit refresh controls and quota warnings.

### Community / Public Station

Suggested pricing:

```txt
$49-$149/year
```

Target user:

- Garden club
- Community garden
- School
- HOA or neighborhood group
- Small farm
- Local facility or recreational venue

Potential features:

- Public read-only station page
- Custom station slug
- Embed widget
- Custom station name/label
- Light branding
- Multiple dashboard sections
- Shared cache for visitors
- Basic usage/quota visibility

API posture:

- Public visitors should read from YardObs cache, not trigger direct TWC calls.
- Cache refresh should be scheduled and conservative.
- Forecast, history, and public widgets should have separate cache TTLs.

### Future YardObs Pro Data

Suggested pricing:

```txt
$15-$30/month minimum, likely organization-focused
```

This tier should only be considered after there is proven demand or committed revenue. It would potentially use a YardObs-owned commercial TWC API subscription.

Potential features:

- YardObs-managed commercial API access
- Enhanced forecast content
- Longer hourly forecasts
- Alerts
- Air quality
- Pollen or lifestyle indices
- Agriculture features such as growing degree days, frost potential, and watering needs
- Severe weather or lightning products where licensed

Major caveat:

- A public Standard TWC plan is currently listed at `$500/month` for `1 million API calls/month`. YardObs should not take on that cost until paid demand is clear.

## API-Safe Paid Features

These are good candidates because they mostly improve experience, presentation, sharing, or analysis without dramatically increasing upstream API usage:

- Multiple saved stations with controlled refresh
- Custom dashboards
- Better charts
- Daily/weekly/monthly summaries from cached data
- CSV export
- Shareable chart images
- Public station page with cache
- Embeddable widget with cache
- Station branding
- Custom themes
- Historical comparisons within available cached history
- Usage/quota visibility

## API-Risky Paid Features

These should wait until quota controls, caching, and licensing are stronger:

- Server-side background polling for every user
- Push alerts requiring frequent server checks
- Public dashboards that fetch live data per visitor
- Multi-station always-on monitoring
- 1-minute refresh as a default
- 15-day hourly forecasts
- Air quality, pollen, agriculture indices, severe weather, lightning, and imagery
- Automated rich narrative content that calls several TWC endpoints repeatedly

## PWA vs App Store

The recommended path is to remain PWA-first.

Reasons:

- Lower operational overhead
- No app review cycle
- Easier direct billing or donation support
- No app store commission
- Better fit for a small, focused tool

Known app store costs and considerations:

- Apple Developer Program: `$99/year`
- Google Play Console: `$25` one-time registration
- Store commissions may apply to paid apps, subscriptions, and in-app purchases
- App stores may become worthwhile later for native widgets, notification strategy, or discovery

For now, app stores do not appear necessary for break-even.

## Break-Even Scenarios

At roughly `$45/month`, YardObs could break even with combinations such as:

```txt
15 users at $3/month
6 organizations at $99/year
25 supporters at $25 in year one
10 supporters at $25 plus 4 organizations at $99/year
```

The preferred path is a mix of:

- One-time individual supporter purchases
- Annual organization/community plans
- Later subscription only for truly recurring hosted value

## Recommended Next Steps

1. Keep the initial multi-user product BYO-key.
2. Add usage-aware caching and rate-limit protection before public station pages.
3. Design the account model with future billing flags, even if billing is not implemented immediately.
4. Validate demand for public station pages and embeddable widgets.
5. Build Supporter features around UX, exports, customization, and analysis rather than more API calls.
6. Do not buy commercial TWC access until a paid tier can plausibly cover it.
7. Review TWC licensing and terms before charging for public or commercial pages.

## Initial Product Recommendation

Launch monetization in this order:

```txt
1. Free private BYO-key dashboard
2. One-time Supporter unlock
3. Annual Community/Public Station plan
4. Optional commercial TWC-powered Pro Data tier later
```

This keeps YardObs aligned with its likely audience, respects API limits, avoids premature recurring-cost commitments, and leaves room for a subscription only where the product is clearly providing ongoing hosted value.
