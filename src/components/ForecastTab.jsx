import { useRef, useState, useEffect } from 'react';

const ICON_EMOJI = {
  0:'🌪️',1:'🌀',2:'🌀',3:'⛈️',4:'⛈️',5:'🌨️',6:'🌧️',7:'🌧️',8:'🌧️',
  9:'🌦️',10:'🌧️',11:'🌧️',12:'🌧️',13:'🌨️',14:'🌨️',15:'🌨️',16:'❄️',
  17:'🌨️',18:'🌧️',19:'🌫️',20:'🌫️',21:'🌫️',22:'💨',23:'💨',24:'💨',
  25:'🥶',26:'☁️',27:'☁️',28:'☁️',29:'🌙',30:'⛅',31:'🌙',32:'☀️',
  33:'🌙',34:'🌤️',35:'🌧️',36:'🌡️',37:'⛈️',38:'⛈️',39:'🌦️',40:'🌧️',
  41:'🌨️',42:'❄️',43:'🌨️',44:'❓',45:'🌦️',46:'🌨️',47:'⛈️',
};

function fmt(val, digits = 0) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(digits);
}

function fmtHour(isoStr) {
  const d = new Date(isoStr);
  const h = d.getMinutes() >= 30 ? (d.getHours() + 1) % 24 : d.getHours();
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

const WMO_EMOJI = {
  0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌧️', 55:'🌧️', 56:'🌧️', 57:'🌧️',
  61:'🌦️', 63:'🌧️', 65:'🌧️', 66:'🌧️', 67:'🌧️',
  71:'🌨️', 73:'🌨️', 75:'❄️', 77:'❄️',
  80:'🌦️', 81:'🌧️', 82:'🌧️', 85:'🌨️', 86:'❄️',
  95:'⛈️', 96:'⛈️', 99:'⛈️',
};

function buildHours(hf) {
  const h = hf?.hourly;
  if (!h?.time?.length) return [];
  const now = Date.now();
  return h.time
    .map((t, i) => ({
      time: t,
      ms: new Date(t).getTime(),
      icon: WMO_EMOJI[h.weathercode?.[i]] ?? '🌡️',
      temp: h.temperature_2m?.[i],
      pop: h.precipitation_probability?.[i] ?? 0,
    }))
    .filter(hr => hr.ms >= now - 30 * 60 * 1000)
    .slice(0, 24)
    .map((hr, i) => ({ ...hr, isNow: i === 0 }));
}

function groupByDay(hours) {
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const groups = [];
  let current = null;
  for (const hr of hours) {
    const date = hr.time.slice(0, 10);
    if (!current || current.date !== date) {
      const d = new Date(date + 'T12:00:00');
      current = {
        date,
        label: date === todayStr
          ? 'Today'
          : `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getDate()}`,
        hours: [],
      };
      groups.push(current);
    }
    current.hours.push(hr);
  }
  return groups;
}

function buildDays(forecast) {
  if (!forecast) return [];
  const { dayOfWeek = [], temperatureMax = [], temperatureMin = [], daypart = [] } = forecast;
  const icons = daypart?.[0]?.iconCode ?? [];
  const pops  = daypart?.[0]?.precipChance ?? [];
  return dayOfWeek.map((dow, i) => ({
    dayOfWeek: dow,
    tempMax:   temperatureMax[i],
    tempMin:   temperatureMin[i],
    icon:      ICON_EMOJI[icons[i * 2] ?? icons[i]] ?? '🌡️',
    pop:       pops[i * 2] ?? pops[i],
    isToday:   i === 0,
  }));
}

// Div-based bar chart for precipitation forecast
function PrecipBars({ days }) {
  const max = Math.max(...days.map(d => d.pop ?? 0), 1);
  const labels = days.map(d => (d.dayOfWeek ?? '').slice(0, 3).toUpperCase());
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 70, margin: '10px 0 6px' }}>
      {days.map((d, i) => {
        const pct = d.pop ?? 0;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ fontSize: 8, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
              {pct > 0 ? `${pct}%` : ''}
            </div>
            <div style={{
              width: '100%', borderRadius: '4px 4px 0 0',
              background: 'var(--bar)', opacity: 0.85,
              height: Math.max((pct / max) * 50, pct > 0 ? 4 : 1), minHeight: 1,
              transition: 'height 0.4s',
            }} />
            <div style={{ fontSize: 9, color: 'var(--tm)', fontFamily: 'var(--font-mono)' }}>{labels[i]}</div>
          </div>
        );
      })}
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

export default function ForecastTab({ forecast, isLoading, chartColors, hourlyForecast }) {
  const scrollRef = useRef(null);
  const groupRefs = useRef([]);
  const [activeLabel, setActiveLabel] = useState(null);

  const groups = groupByDay(hourlyForecast ? buildHours(hourlyForecast) : []);

  useEffect(() => {
    if (groups.length > 0) setActiveLabel(groups[0].label);
  }, [hourlyForecast]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const days = buildDays(forecast);

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
      {!hourlyForecast ? <HourSkeleton /> : (
        <>
          <div style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            textTransform: 'uppercase', color: 'var(--tm)', marginBottom: 8,
            fontFamily: 'var(--font-display)', transition: 'opacity 0.2s',
          }}>
            {activeLabel ?? groups[0]?.label ?? ''}
          </div>
          <div
            ref={scrollRef}
            onScroll={handleHourlyScroll}
            style={{ display: 'flex', overflowX: 'auto', paddingBottom: 4, marginBottom: 20, alignItems: 'flex-start' }}
          >
            {groups.map((group, gi) => (
              <div
                key={group.date}
                ref={el => { groupRefs.current[gi] = el; }}
                style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: gi > 0 ? 16 : 0 }}
              >
                {group.hours.map((hr, i) => (
                  <div
                    key={i}
                    style={{
                      flex: '0 0 56px',
                      background: hr.isNow ? 'var(--soft)' : 'var(--card)',
                      border: `1px solid ${hr.isNow ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 16,
                      padding: '10px 6px',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase' }}>
                      {hr.isNow ? 'Now' : fmtHour(hr.time)}
                    </div>
                    <div style={{ fontSize: 20, margin: '6px 0 3px' }} aria-hidden="true">{hr.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
                      {fmt(hr.temp)}°
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 3, visibility: hr.pop > 0 ? 'visible' : 'hidden' }}>
                      {hr.pop}%
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--tp)', marginBottom: 12, marginTop: 4 }}>
        5-Day Forecast
      </div>

      {/* Horizontal scroll cards */}
      <div className="fc-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
        {days.map((day, i) => (
          <div
            key={i}
            style={{
              flex: '0 0 70px',
              background: day.isToday ? 'var(--soft)' : 'var(--card)',
              border: `1px solid ${day.isToday ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 16,
              padding: '12px 8px',
              textAlign: 'center',
              transition: 'all 0.2s',
              cursor: 'default',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase' }}>
              {day.isToday ? 'Today' : (day.dayOfWeek ?? '').slice(0, 3)}
            </div>
            <div style={{ fontSize: 22, margin: '8px 0 4px' }} aria-hidden="true">{day.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
              {fmt(day.tempMax)}°
            </div>
            <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'var(--font-mono)' }}>
              {fmt(day.tempMin)}°
            </div>
            {day.pop != null && (
              <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 4 }}>{day.pop}%</div>
            )}
          </div>
        ))}
      </div>

      {/* Precipitation bar chart */}
      {days.length > 0 && (
        <div className="y-card">
          <div className="y-label">Precipitation Chance</div>
          <PrecipBars days={days} />
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', padding: '6px 0 4px', letterSpacing: '0.3px' }}>
        TWC Daily Forecast API
      </div>
    </div>
  );
}
