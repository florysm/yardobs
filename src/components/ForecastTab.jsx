import { useRef, useState, useEffect } from 'react';
import { fmtHourIso, fmtClockTime } from '../utils/format';
import { buildHours, groupByDay, buildDays } from '../utils/forecastView';
import { placeClock, placeTimeZone } from '../utils/placeTime';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { insightScope } from '../utils/insightCache';
import { useInsight } from '../hooks/useInsight';
import { formatTempParts } from '../utils/units';
import { currentDayPart } from '../utils/insightVocab';
import { buildDayOutlook } from '../utils/outlook';
import { aqiForDay } from '../utils/forecastNormalize';
import { todayHigh } from '../utils/weatherCalc';
import SunMoonCard from './SunMoonCard';
import { SOURCE_TYPES } from '../utils/sourceTypes';

// Matches HourlyCard's `flex: '0 0 56px'` and .fc-hourly-group's `gap: 8`.
const HOUR_CARD_W = 56;
const HOUR_CARD_GAP = 8;
const HOUR_GROUP_MARGIN = 16; // marginLeft applied to every group after the first

function groupWidthPx(hourCount) {
  return hourCount * HOUR_CARD_W + Math.max(0, hourCount - 1) * HOUR_CARD_GAP;
}

export function HourlyCard({ hr, units }) {
  return (
    <div
      className="fc-card"
      style={{
        flex: '0 0 56px',
        padding: '10px 6px',
        textAlign: 'center',
        ...(hr.isNow ? { background: 'var(--soft)', borderColor: 'var(--accent)' } : {}),
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {hr.isNow ? 'Now' : fmtHourIso(hr.time)}
      </div>
      <div style={{ fontSize: 20, margin: '6px 0 3px' }} aria-hidden="true">{hr.icon}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
        {formatTempParts(hr.temp, units).value}°
      </div>
      <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 3, visibility: hr.pop > 0 ? 'visible' : 'hidden' }}>
        {hr.pop}%
      </div>
    </div>
  );
}

export function DailyCard({ day, isSelected, onClick, currentTemp, todayObservedHigh, units }) {
  return (
    <div
      className="fc-card"
      onClick={onClick}
      style={{
        flex: '0 0 70px',
        padding: '12px 8px',
        textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
        ...(isSelected ? { background: 'var(--soft)', borderColor: 'var(--accent)' } : {}),
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase' }}>
        {day.isToday ? 'Today' : (day.dayOfWeek ?? '').slice(0, 3)}
      </div>
      <div style={{ fontSize: 22, margin: '8px 0 4px' }} aria-hidden="true">{day.icon}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
        {formatTempParts(day.isToday ? todayHigh(day.tempMax, todayObservedHigh, currentTemp) : day.tempMax, units).value}°
      </div>
      <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'var(--font-mono)' }}>
        {formatTempParts(day.tempMin, units).value}°
      </div>
      {day.pop != null && (
        <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 4 }}>{day.pop}%</div>
      )}
    </div>
  );
}

function HourSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }}>
      {[0,1,2,3,4,5,6].map(i => (
        <div key={i} style={{
          flex: '0 0 56px', height: 100, borderRadius: 16,
          background: 'var(--card)', border: '1px solid var(--border)',
          opacity: 0.4, animation: 'pulse 1.5s infinite',
        }} />
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{
            flex: '0 0 70px', height: 140, borderRadius: 16,
            background: 'var(--card)', border: '1px solid var(--border)',
            opacity: 0.4, animation: 'pulse 1.5s infinite',
          }} />
        ))}
      </div>
    </div>
  );
}

function ForecastDayInsight({ insight, isLoading }) {
  return (
    <div className="y-card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <div className="live-dot" style={{ background: 'var(--tm)' }} />
        <div style={{ fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--tm)' }}>AI</div>
      </div>
      {isLoading ? (
        <div style={{ fontSize: 14, color: 'var(--tm)', fontStyle: 'italic', lineHeight: 1.65 }}>
          Analyzing forecast…
        </div>
      ) : insight?.narrative ? (
        <>
          <p style={{ fontSize: 14, color: 'var(--tp)', lineHeight: 1.65, margin: '0 0 10px', fontWeight: 300, fontFamily: 'var(--font-body)' }}>
            {insight.narrative}
          </p>
          <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: '0.3px' }}>
            {insight.updatedAt ? `Updated ${insight.updatedAt} · refreshes hourly` : 'Refreshes hourly'}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--tm)', fontStyle: 'italic', margin: 0 }}>
          Forecast insight unavailable right now.
        </p>
      )}
    </div>
  );
}

export default function ForecastTab({ forecast, isLoading, hourlyForecast, airQuality, lat, lon, todayObservedHigh, stationId, sourceType, currentTemp, units }) {
  const scrollRef = useRef(null);
  const groupRefs = useRef([]);
  const [activeLabel, setActiveLabel] = useState(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  // The place's clock (see placeTime.js): exploring another time zone, the
  // strip's "Now", "Today" and the rest-of-today narrative are that place's.
  const tz = placeTimeZone(hourlyForecast);
  const clock = placeClock(tz);
  const groups = groupByDay(buildHours(hourlyForecast, clock, currentTemp), clock.date);

  useEffect(() => {
    if (groups.length > 0) setActiveLabel(groups[0].label);
  // groups is derived from hourlyForecast every render; using it as a dep would
  // trigger this effect on every render. hourlyForecast is the true signal.
  }, [hourlyForecast]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI narrative for the selected day.
  const insightDay = buildDays(forecast, clock.date)[selectedDayIndex] ?? null;
  const insightId = insightScope({ stationId, sourceType, lat, lon });
  const dayAqi = insightDay ? aqiForDay(airQuality, insightDay.date) : null;
  // Same 25-wide bucket the server keys on, so client and server invalidate together.
  const aqiBucket = dayAqi == null ? 'na' : Math.round(dayAqi / 25) * 25;
  // Today describes the rest of the day, so it's keyed to the part of the day
  // we're in and regenerates as each one passes; other days are an overview.
  const dayPart = insightDay?.isToday ? currentDayPart(clock.wall) : 'day';
  const { data: dayInsight, loading: dayInsightLoading } = useInsight({
    storageKey: insightDay && STORAGE_KEYS.forecastDayInsightKey(insightId, insightDay.date, units, aqiBucket, dayPart),
    enabled: !!insightDay,
    // hourlyForecast and airQuality are deps because the trajectory and the AQI
    // sent to the model are derived from them — both arrive after `forecast`, and
    // without them the first request for a day goes out missing that detail.
    deps: [selectedDayIndex, forecast, hourlyForecast, airQuality],
    buildBody: async () => ({
      type: 'forecast-day',
      stationId: insightId,
      date: insightDay.date,
      dayLabel: insightDay.isToday ? 'Today' : insightDay.dayOfWeek,
      tempMax: insightDay.tempMax,
      tempMin: insightDay.tempMin,
      pop: insightDay.pop,
      conditions: insightDay.phrase,
      isToday: insightDay.isToday,
      dayPart: insightDay.isToday ? dayPart : null,
      // By day part, so the model can't misfile a 10pm reading as evening.
      // Today starts at the current hour: what's left, not what's passed.
      outlook: buildDayOutlook(hourlyForecast, insightDay.date, units,
        { fromHour: insightDay.isToday ? clock.hour : 0 }),
      aqi: dayAqi,
      sourceType: sourceType ?? SOURCE_TYPES.PWS,
      units,
    }),
    accept: json => (json?.narrative ? {
      narrative: json.narrative,
      updatedAt: fmtClockTime(new Date()),
    } : null),
  });

  if (isLoading) return <Skeleton />;

  if (!forecast) {
    return (
      <div className="y-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div style={{ fontSize: 13, color: 'var(--tm)' }}>Forecast unavailable</div>
        <div style={{ fontSize: 11, color: 'var(--tm)', opacity: 0.6, marginTop: 4 }}>
          Opens after current conditions load
        </div>
      </div>
    );
  }

  const days = buildDays(forecast, clock.date);

  function handleHourlyScroll() {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const center = scrollLeft + clientWidth / 2;
    let label = groups[0]?.label ?? null;
    groupRefs.current.forEach((ref, i) => {
      if (ref && ref.offsetLeft <= center) label = groups[i]?.label ?? label;
    });
    if (label) setActiveLabel(label);
  }

  return (
    <div>
      {/* Hourly section */}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--tp)', marginBottom: 8, marginTop: 4 }}>
        Hourly Forecast
      </div>
      {!hourlyForecast ? (
        <div className="y-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ fontSize: 13, color: 'var(--tm)' }}>Hourly forecast unavailable</div>
        </div>
      ) : (
        <>
          <div style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            textTransform: 'uppercase', color: 'var(--tm)', marginBottom: 8,
            fontFamily: 'var(--font-display)', transition: 'opacity var(--tr-fast)',
          }}>
            {activeLabel ?? groups[0]?.label ?? ''}
          </div>
          <div
            ref={scrollRef}
            onScroll={handleHourlyScroll}
            style={{ overflowX: 'auto', paddingBottom: 4, marginBottom: 20, width: '100%' }}
          >
            {/* Layout lives in .fc-hourly-track / .fc-hourly-group (index.css),
                sized here with explicit pixel widths — see the comment there.
                Do not go back to letting width resolve from content (max-content
                or inline-flex shrink-to-fit): the overnight cards overlap on iOS
                Safari, and only on iOS Safari. */}
            <div
              className="fc-hourly-track"
              style={{
                width: groups.reduce((sum, g) => sum + groupWidthPx(g.hours.length), 0)
                  + Math.max(0, groups.length - 1) * HOUR_GROUP_MARGIN,
              }}
            >
            {groups.map((group, gi) => (
              <div
                key={group.date}
                ref={el => { groupRefs.current[gi] = el; }}
                className="fc-hourly-group"
                style={{ width: groupWidthPx(group.hours.length), marginLeft: gi > 0 ? HOUR_GROUP_MARGIN : 0 }}
              >
                {group.hours.map((hr) => (
                  <HourlyCard key={hr.time} hr={hr} units={units} />
                ))}
              </div>
            ))}
            </div>
          </div>
        </>
      )}

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--tp)', marginBottom: 12, marginTop: 4 }}>
        Daily Forecast
      </div>

      {/* Horizontal scroll cards */}
      <div className="fc-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
        {days.map((day, i) => (
          <DailyCard
            key={i}
            day={day}
            isSelected={i === selectedDayIndex}
            onClick={() => setSelectedDayIndex(i)}
            currentTemp={currentTemp}
            todayObservedHigh={todayObservedHigh}
            units={units}
          />
        ))}
      </div>

      <ForecastDayInsight insight={dayInsight} isLoading={dayInsightLoading} />

      <SunMoonCard lat={lat} lon={lon} tz={tz} />

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', padding: '6px 0 4px', letterSpacing: '0.3px' }}>
        TWC Daily Forecast API
      </div>
    </div>
  );
}
