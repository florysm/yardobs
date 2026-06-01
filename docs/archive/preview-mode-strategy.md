# YardObs Preview Mode Strategy

**Date:** May 14, 2026  
**Status:** Approved direction, pending multi-user production implementation

## Executive Summary

YardObs will implement a **forecast-based preview mode** with educational framing to demonstrate value to potential users without diluting the core PWS-focused product. Preview mode is intentionally limited to create desire for hyperlocal personal weather station data, not to serve as a standalone weather app.

## Core Principle

Preview mode is a **marketing tool**, not a product feature. Its purpose is to show users why city-level forecast data isn't good enough for people who care about their specific outdoor space.

## Strategic Context

### What We Rejected

**Location-based full dual-mode:** Building a parallel feature set for non-PWS users would dilute product focus, create maintenance burden, and position YardObs as a generic weather app competing in an oversaturated market.

**Nearby station browser:** Allowing users to view other people's PWS data raises licensing questions, ethical concerns about data consent, and would essentially rebuild Weather Underground.

**Demo station in fixed location:** Showing weather in Pittsburgh to someone in Phoenix provides no value and would result in immediate bounce.

### What We Chose

**Educational preview mode using forecast data:** Shows users what city-level weather looks like, then explicitly demonstrates why hyperlocal backyard data matters. The limitation IS the marketing message.

## Implementation Approach

### Profile Model

```javascript
{
  mode: "station" | "preview",
  
  // Station mode
  stationId?: string,
  
  // Preview mode  
  lat?: number,
  lon?: number,
  label?: string,  // "Phoenix, AZ" or "Your Location"
  
  // Meta
  isDemo: boolean  // true for preview mode
}
```

### Feature Availability Matrix

| Feature | Preview Mode | Station Mode |
|---------|-------------|--------------|
| Current conditions | ✅ Forecast model | ✅ PWS data |
| 5-day forecast | ✅ Full | ✅ Full |
| Hourly forecast | ✅ Full | ✅ Full |
| Radar | ✅ Full | ✅ Full |
| AQI | ✅ Full | ✅ Full |
| Historical trends | 🔒 Locked (educational placeholder) | ✅ Full |
| AI insights | ✅ Generic city-level | ✅ Hyperlocal backyard-specific |
| Activity scoring | ✅ Basic | ✅ Enhanced with actual conditions |
| Settings/customization | ❌ None | ✅ Full |
| Year-over-year comparisons | 🔒 Locked | ✅ Full |
| Precipitation totals | 🔒 Forecast only | ✅ Actual measured rainfall |
| Solar radiation | 🔒 Not available | ✅ Full (where supported) |

### Data Sources

**Preview mode:**
- Current conditions: Open-Meteo or similar free forecast API
- Forecast: Open-Meteo (already in use)
- AQI: Open-Meteo (already in use)
- Radar: Existing implementation
- Historical: Not available

**Station mode:**
- All data from user's Weather Underground / TWC PWS API key
- Existing implementation unchanged

### Key UI Components

#### 1. Preview Banner (Persistent)
```
┌─────────────────────────────────────────┐
│ 📍 Preview Mode: Phoenix, AZ            │
│ Using forecast data. Connect your PWS   │
│ for hyperlocal accuracy.                │
│ [Connect Station →]                     │
└─────────────────────────────────────────┘
```

#### 2. Educational Callouts

**Now tab:**
```
💡 This is forecast data for your city. Your backyard 
   temperature could vary by 5-10°F depending on shade, 
   pavement, and elevation.
```

**Forecast tab:**
```
💡 City-level forecasts can't predict rainfall in your 
   specific yard. Thunderstorms often dump 0.5" on one 
   neighborhood while missing areas just 2 miles away.
```

**Activity scoring:**
```
💡 These scores use forecast data. With a PWS, get activity 
   recommendations based on YOUR actual backyard conditions.
```

#### 3. Locked Feature Placeholders

**Trends tab:**
```
┌─────────────────────────────────────────┐
│ Historical Trends                       │
│ 🔒 Requires Personal Weather Station   │
│                                         │
│ [Blurred/grayed chart visualization]   │
│                                         │
│ Historical trends require data from     │
│ your personal weather station.          │
│                                         │
│ With your PWS, you'll see:              │
│ • 30+ days of temperature & rainfall    │
│ • Year-over-year comparisons           │
│ • Custom date ranges                    │
│ • Actual measured precipitation         │
│                                         │
│ [Connect Your Station]                  │
│ [Learn Why This Matters →]              │
└─────────────────────────────────────────┘
```

**AI Insights (modified in preview):**
- Remove all "backyard" and "station" language
- Use generic city-level insights: "Pleasant conditions today"
- Add callout: "With a PWS, get insights about YOUR specific conditions"
- No year-over-year comparisons
- Include forecast-based rain risk when actual precip data unavailable

### API Implementation Notes

```javascript
// api/weather.js pseudo-code

if (profile.mode === 'preview') {
  // Preview mode: forecast data only
  if (type === 'current') {
    return await fetchForecastCurrent(lat, lon);
  }
  if (type === 'forecast' || type === 'hourly-forecast') {
    return await fetchForecast(lat, lon);
  }
  if (type === 'air-quality') {
    return await fetchAQI(lat, lon);
  }
  if (type.startsWith('history')) {
    return res.status(403).json({ 
      error: 'Historical data requires a personal weather station',
      upgrade: true 
    });
  }
}

if (profile.mode === 'station') {
  // Existing PWS implementation unchanged
}
```

### Normalized Response Shape

The API should return a consistent shape regardless of source:

```javascript
{
  temp,
  feelsLike,
  humidity,
  windSpeed,
  windGust,
  windDir,
  pressure,
  dewPoint,
  precipRate,      // null in preview mode
  precipTotal,     // null in preview mode
  uv,
  solar,           // null in preview mode
  iconCode,
  isDay,
  lat,
  lon,
  sourceType,      // "pws" | "forecast_model"
  sourceLabel,     // "Your Station" | "Weather Forecast"
  obsTimeLocal
}
```

Frontend components should handle null values gracefully and show "Not available in preview mode" where appropriate.

## User Journey

### Preview User Flow
1. Lands on YardObs.com
2. Clicks "Try Demo" or "See Preview"
3. Either:
   - Allows browser geolocation, OR
   - Manually enters ZIP/city
4. Sees YardObs UI with forecast data and educational callouts
5. Explores features, encounters locked Trends tab
6. Clicks "Why Backyard Weather Matters" or "Connect Your Station"
7. Reads educational content about hyperlocal weather variability
8. Either:
   - Already has PWS → "Connect My Station" setup flow
   - Doesn't have PWS → "Recommended Hardware" → Purchase → Connect

### Station User Flow (Unchanged)
1. Signs in
2. Enters station ID and TWC API key
3. Validates and saves
4. Gets full YardObs experience with all features

## Supporting Content Needed

### 1. "Why Backyard Weather Matters" Landing Page

Key points to cover:
- **Urban heat island effects:** Airport can be 10°F cooler than urban backyards
- **Microclimates:** Shaded gardens vs. sunny patios vary significantly
- **Rainfall variability:** Thunderstorms are hyperlocal; 0.5" in one yard, 0" two blocks away
- **Wind patterns:** Neighborhood buildings/trees create unique wind conditions
- **Use cases:** 
  - Gardeners: frost risk, watering decisions, growing degree days
  - Weather hobbyists: personal data collection and analysis
  - Educators: teaching kids about weather and data science
  - Communities: shared neighborhood environmental data

Include real examples with data/photos if possible.

### 2. PWS Setup Guide

- Recommended hardware (Ambient Weather, Ecowitt, Davis, etc.)
- How to register station with Weather Underground
- How to obtain TWC API key
- How to connect station to YardObs
- Troubleshooting common issues

### 3. Hardware Recommendations

- Entry-level stations ($100-$200)
- Mid-range stations ($200-$400)
- Advanced stations ($400+)
- What features matter for different use cases
- Potential affiliate partnerships (future monetization opportunity)

### 4. FAQ

**Q: What's the difference between preview and station mode?**  
A: Preview mode uses city-level forecast data. Station mode uses real-time data from your personal weather station in your backyard, providing hyperlocal accuracy for temperature, rainfall, wind, and more.

**Q: How accurate is preview mode?**  
A: Preview mode is as accurate as standard weather forecasts for your city, but your specific backyard can vary by 5-10°F in temperature and receive significantly different rainfall.

**Q: Do I need to buy a weather station?**  
A: No, preview mode is always free. But if you care about what's actually happening in YOUR outdoor space, a personal weather station provides much more accurate and relevant data.

**Q: Which weather stations work with YardObs?**  
A: Any station that uploads to Weather Underground and provides a TWC API key. See our hardware recommendations.

**Q: Can I use someone else's nearby station?**  
A: Not currently. YardObs is designed for people who want to monitor their own specific location. Weather can vary significantly even within a few blocks.

## Technical Implementation Checklist

### Phase 1: Core Preview Mode (Pre-requisite: Multi-user auth in place)
- [ ] Add `mode` field to user profile model
- [ ] Location input UI (manual + geolocation)
- [ ] Geocoding for city name from lat/lon
- [ ] Open-Meteo integration for current conditions (if not already complete)
- [ ] Preview banner component
- [ ] Educational callout components
- [ ] Modify AI insights for generic vs. hyperlocal messaging
- [ ] Handle null values in UI (precipTotal, solar, etc.)

### Phase 2: Locked Features & Education
- [ ] Locked feature placeholder component
- [ ] Trends tab locked state with educational content
- [ ] "Why Backyard Weather Matters" landing page
- [ ] PWS setup guide
- [ ] Hardware recommendations page
- [ ] FAQ section

### Phase 3: Conversion Optimization
- [ ] Clear CTAs throughout preview mode
- [ ] "Connect Your Station" flow from preview
- [ ] A/B test messaging and CTA placement
- [ ] Analytics to track preview → station conversion
- [ ] Optional: email capture for "notify me when I get my station"

### Phase 4: Polish (Post-launch)
- [ ] Side-by-side comparison (forecast vs. typical PWS variance)
- [ ] Video/GIF demos of station mode features
- [ ] Partner affiliate links for PWS hardware
- [ ] Blog content about hyperlocal weather
- [ ] Social proof: testimonials from PWS owners

## Messaging & Positioning

### Landing Page Headline Options
- "Beautiful Weather for Your Backyard" (current)
- "What's the Weather in YOUR Yard?" (question format)
- "Your City's Forecast Doesn't Know Your Backyard" (problem-focused)
- "Hyperlocal Weather from Your Own Station" (benefit-focused)

### Preview Mode Messaging
Never apologize for limitations. Frame them as educational:

❌ "Sorry, this feature requires a weather station"  
✅ "Historical trends require data from your personal weather station"

❌ "Preview mode has limited features"  
✅ "Preview mode uses city-level forecast data. Your backyard can be very different."

❌ "Upgrade to see more"  
✅ "Connect your station for hyperlocal accuracy"

### Educational Tone
- Informative, not preachy
- Data-driven examples
- Respect user intelligence
- Show, don't just tell (use real data comparisons where possible)

## What This Is NOT

**This is NOT:**
- ❌ A competitor to Weather Underground, Dark Sky, or other consumer weather apps
- ❌ A parallel product with full feature parity for non-PWS users
- ❌ A way to satisfy users who just want free weather
- ❌ A generic location-based weather app
- ❌ A nearby station browser

**This IS:**
- ✅ An educational marketing tool
- ✅ A demonstration of YardObs UI/UX quality
- ✅ A way to show why hyperlocal data matters
- ✅ A conversion funnel to PWS ownership
- ✅ A proof-of-concept that creates desire for the real product

## Success Metrics (Future)

Once implemented, track:
- Preview mode engagement (time spent, pages viewed)
- Locked feature click-through rate
- Educational content page views
- Preview → station mode conversion rate
- Hardware recommendation page engagement
- "Connect Your Station" funnel completion rate

Success is NOT measured by preview mode DAU.  
Success IS measured by preview users becoming PWS owners.

## Alignment with Monetization Strategy

Preview mode supports the monetization plan from `monetization-plan.md`:

**Free tier:**
- Preview mode available to anyone (no station required)
- Station owners get full features with BYO API key

**Future Supporter tier ($19-29 one-time):**
- Advanced features for station owners
- Preview users cannot access even with payment (station required)

**Future Community tier ($49-99/year):**
- Public station pages
- Preview mode could show example public pages as part of education

Preview mode does not commit to any specific monetization strategy. It simply ensures curious visitors can experience YardObs without bouncing immediately.

## Open Questions for Later

- Should preview mode require account creation or work anonymously?
- Should we track preview locations for analytics (with privacy considerations)?
- Could we show a "stations near you" map as educational content (not browsing)?
- Should there be a time limit on preview mode or can it be used indefinitely?
- What's the right balance of educational content vs. being annoying?

These can be answered during implementation based on user feedback.

## Final Note

Preview mode represents a clear strategic choice: **YardObs is for personal weather station owners, period.** Preview mode exists to show people why they should join that group, not to serve them as non-owners indefinitely.

This preserves product focus, maintains clear positioning, and creates a conversion funnel without diluting the core value proposition.

When someone asks "Can I use YardObs without a weather station?", the answer is:

> "Yes, you can try preview mode to see what YardObs looks like with forecast data. But to get the real value—hyperlocal accuracy, historical trends, and insights about YOUR actual backyard—you need a personal weather station. Here's why that matters..."
