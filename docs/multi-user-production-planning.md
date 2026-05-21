# YardObs Multi-User Production Planning

First draft: May 8, 2026

This document captures the initial analysis for taking YardObs from a personal, single-station deployment to a real multi-user production application. It is intentionally a working draft. The goal is to give us something concrete to review, revise, and use for implementation planning over the next few days.

## Current Deployment Model

YardObs is currently deployed as a Vite React application on Vercel.

The frontend is built with:

```txt
npm run build
```

Vercel serves the generated `dist` directory as static assets. API requests go through a single Vercel Serverless Function:

```txt
api/weather.js
```

The current deployment assumes one owner, one weather station, and one TWC API key.

Current credential/configuration flow:

```txt
VITE_PWS_STATION_ID -> bundled into the browser by Vite
TWC_API_KEY         -> stored privately in Vercel environment variables
```

The browser passes the station ID to `/api/weather`. The serverless function reads `process.env.TWC_API_KEY`, calls The Weather Company API, and returns weather data to the frontend.

That works well for a personal dashboard, but it does not scale to multiple users because every user would share the same station and the same server-owned TWC API key.

## Desired Production Model

The production version should let each user connect YardObs to their own Weather Underground / TWC personal weather station.

Each user should be able to save:

- Their TWC API key
- Their PWS station ID
- An optional friendly station label
- Future user preferences, such as units, theme choices, or refresh behavior

The important shift is this:

```txt
Current model:
The deployment owns the station and API key.

Production model:
Each authenticated user owns their own station and API key.
```

## Recommended Architecture

For a real multi-user version, the app should use:

- Authentication
- A database
- Server-side encrypted storage for TWC API keys
- Serverless API routes that look up the current user's saved settings
- Rate limiting and caching to protect both Vercel usage and user TWC quotas

Recommended request flow:

```txt
1. User signs in.
2. User saves station ID and TWC API key.
3. Server validates the key/station pair against TWC.
4. Server encrypts and stores the TWC API key.
5. Frontend requests weather data.
6. Server identifies the logged-in user.
7. Server loads and decrypts that user's TWC key.
8. Server calls TWC.
9. Server returns weather data to the frontend.
```

The browser should not receive another user's API key, and ideally should not receive the current user's raw API key after it has been saved.

## Data Model Draft

A simple first-pass database table could look like this:

```txt
user_weather_settings
- id
- user_id
- station_id
- station_label
- encrypted_twc_api_key
- created_at
- updated_at
```

Later, we may add:

```txt
- units
- refresh_interval_seconds
- last_validated_at
- validation_status
- last_twc_error
```

We may also eventually add a cache table for weather responses:

```txt
weather_cache
- id
- user_id
- station_id
- request_type
- cache_key
- response_json
- expires_at
- created_at
```

This is optional for the first implementation, but likely useful once more users are active.

## Frontend Changes Needed

The frontend currently reads the station ID from:

```txt
import.meta.env.VITE_PWS_STATION_ID
```

That should be replaced with a user settings flow.

High-level UI changes:

- Add sign-in/sign-out UI.
- Add a first-run setup screen for users with no saved station.
- Add settings fields for station ID and TWC API key.
- Add a "Test Connection" or "Save and Validate" action.
- Show a clear error if the station ID or API key is invalid.
- Show the user's saved station in the top bar and settings drawer.

The `useWeather` hook should no longer assume station configuration comes from build-time environment variables. It should fetch weather for the authenticated user's saved configuration.

## API Changes Needed

The current `api/weather.js` accepts query parameters such as:

```txt
type=current
stationId=...
date=...
lat=...
lon=...
```

For production, the weather API should be refactored so that `stationId` and API key come from the logged-in user's saved server-side settings.

Possible API route shape:

```txt
GET  /api/settings
POST /api/settings
POST /api/settings/validate
GET  /api/weather?type=current
GET  /api/weather?type=history&date=YYYYMMDD
GET  /api/weather?type=history-recent
GET  /api/weather?type=history-daily&date=YYYYMMDD
GET  /api/weather?type=forecast
```

The server should:

- Require authentication for settings and weather routes.
- Validate request parameters.
- Load the user's saved station settings.
- Decrypt the user's TWC API key.
- Call TWC from the server.
- Avoid logging raw API keys.
- Return friendly errors for invalid credentials, quota issues, or missing setup.

## Security Notes

TWC API keys should not be stored in plaintext.

At minimum:

- Encrypt API keys before storing them in the database.
- Store the encryption secret in Vercel environment variables.
- Never prefix secrets with `VITE_`.
- Never return the raw TWC key from API routes after save.
- Avoid writing secrets to logs.

Important Vite rule:

```txt
Any environment variable prefixed with VITE_ is exposed to the browser bundle.
```

That means `TWC_API_KEY` must stay server-side. User-provided TWC keys should also stay server-side after they are submitted.

## Cost Analysis Draft

Pricing changes over time, so these numbers should be rechecked before launch. This snapshot is based on public pricing reviewed on May 8, 2026.

### Vercel

For a public or commercial multi-user app, Vercel Pro is the likely baseline.

Estimated cost:

```txt
Vercel Pro: $20/month
```

Vercel Pro currently includes usage credits and generous included usage for the likely early shape of this app. YardObs is mostly static frontend plus small serverless API calls, so hosting costs should remain low at first.

Main Vercel usage drivers:

- Function invocations from weather polling
- Function compute time
- Data transfer
- Analytics, if enabled

The current app polls current weather every 5 minutes while open.

Approximate polling math:

```txt
1 user open 1 hour/day:
12 current-weather calls/day
~360 calls/month

1 user open all day:
288 current-weather calls/day
~8,640 calls/month

100 users open all day:
~864,000 current-weather calls/month
```

This suggests Vercel function invocation volume should be manageable early, but TWC API quotas and user experience should still be protected with caching.

### Database And Auth Options

#### Option A: Supabase

Supabase is attractive because it combines Postgres and Auth in one service.

Estimated cost:

```txt
Supabase Free: $0/month for MVP
Supabase Pro:  $25/month for more serious production use
```

Reasons to consider Supabase:

- Auth and database in one place
- Postgres
- Good free tier for MVP
- Fewer moving parts than separate auth/database vendors

Reasons we might outgrow Free:

- Need for stronger production guarantees
- Need for backups
- Need to avoid free project pausing/inactivity behavior
- Need support or more retention

#### Option B: Clerk + Neon

This is also a strong production stack.

Estimated cost:

```txt
Clerk Hobby: $0/month to start
Clerk Pro:   ~$20/month billed annually
Neon Free:   $0/month to start
Neon Launch: typical spend around $15/month
```

Reasons to consider Clerk + Neon:

- Clerk has excellent auth UI and user management
- Neon is a strong serverless Postgres option
- Clean separation between auth and data

Tradeoff:

- Two services instead of one
- Slightly more integration work

### Custom Domain

A custom domain can be used with Vercel. Vercel provides HTTPS/SSL automatically for configured domains.

Estimated cost:

```txt
Domain registration: usually ~$10-$25/year for a normal .com
Premium domains: can be much more
```

The domain can be purchased through Vercel or through another registrar and pointed to Vercel with DNS.

### Likely Early Monthly Cost

For the first real multi-user production version:

```txt
Vercel Pro:      $20/month
Supabase Free:   $0/month
Domain:          ~$10-$25/year

Approximate early total: ~$20/month plus domain
```

For a more serious production setup:

```txt
Vercel Pro:      $20/month
Supabase Pro:    $25/month
Domain:          ~$10-$25/year

Approximate total: ~$45/month plus domain
```

Optional later costs:

- Vercel Web Analytics or Speed Insights
- Error monitoring such as Sentry
- Transactional email provider
- Stripe or another billing provider if the app charges users
- Higher database tier if usage grows

## TWC API Quota Considerations

Because users will bring their own TWC API keys, YardObs should not need one central paid TWC account for all users.

However, we still need to be respectful of each user's quota.

Recommended protections:

- Cache current observations briefly, likely 1-5 minutes.
- Cache historical responses by station/date.
- Avoid refetching forecast repeatedly when current lat/lon has not changed.
- Make refresh intervals configurable later.
- Show understandable errors for quota/rate-limit responses.

The current five-minute polling behavior is reasonable for a personal dashboard, but production should still avoid duplicate calls from multiple open tabs or aggressive refresh loops.

## Suggested Implementation Phases

### Phase 1: Foundations

- Choose auth/database stack.
- Add authentication.
- Add database schema for user weather settings.
- Add encryption helper for TWC API keys.
- Add settings API routes.

### Phase 2: User Setup

- Add first-run setup screen.
- Add settings form for station ID and TWC API key.
- Add validate-and-save flow.
- Remove dependency on `VITE_PWS_STATION_ID` for normal user operation.

### Phase 3: Weather API Refactor

- Refactor `/api/weather` to use the authenticated user's saved settings.
- Keep TWC API key server-side.
- Improve error handling.
- Add basic caching for current, history, and forecast responses.

### Phase 4: Production Hardening

- Add rate limiting.
- Add server-side request logging without secrets.
- Add error monitoring.
- Add analytics if needed.
- Add better empty/error states in the UI.
- Add migration and backup strategy.

### Phase 5: Launch Readiness

- Configure custom domain.
- Configure production environment variables.
- Review privacy/security language.
- Test with multiple users and multiple stations.
- Confirm TWC API terms and quota behavior.
- Set Vercel spend limits and alerts.

## Open Questions

- Should users enter a station ID, a station name, or both?
- Which auth/database stack should we choose: Supabase, Clerk + Neon, or another option?
- Do we want public signups, invite-only access, or private beta first?
- Should user API keys be editable, masked, or replace-only after save?
- Should there be a demo mode for users without a TWC key?
- How much history should be cached?
- Do we want to support multiple stations per user later?
- Will this app be free, paid, or donation-supported?

## Initial Recommendation

For the first production-minded version, use:

```txt
Vercel Pro
Supabase Auth
Supabase Postgres
Server-side encryption for TWC API keys
Custom domain through Vercel or an external registrar
```

This keeps the architecture understandable while giving us a real path to production. It also avoids splitting the first implementation across too many external services.

The first milestone should be simple:

```txt
A user can sign in, save their own station ID and TWC API key, and see their own weather dashboard without using deployment-level station configuration.
```

