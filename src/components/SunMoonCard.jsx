import SunCalc from 'suncalc';
import { fmtSunTime, fmtMoonTime } from '../utils/format';
import { resolveMoonWindow, moonPhaseName, arcProgress } from '../utils/moon';

// Arc geometry shared by the sun and moon cards (SVG viewBox 0 0 200 88).
const CX = 100, CY = 84, R = 74;
const SUN_COLOR  = '#f5c518';
const MOON_COLOR = '#b0c4de';

const VALUE_STYLE   = { fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' };
const CAPTION_STYLE = { fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 };
const NOTE_STYLE    = { fontSize: 9, color: 'var(--tm)', fontFamily: 'var(--font-mono)', marginTop: 3, opacity: 0.7 };

function fmtDaylight(rise, set) {
  if (!rise || !set) return null;
  const mins = Math.round((set - rise) / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m daylight`;
}

function dotAt(progress) {
  if (progress == null) return null;
  return {
    x: CX + R * Math.cos(Math.PI * (1 - progress)),
    y: CY - R * Math.sin(Math.PI * (1 - progress)),
  };
}

// The horizon, the full track, the travelled portion, and whatever marker the
// card draws at the current position.
function ArcTrack({ progress, color, children }) {
  const dot = dotAt(progress);
  return (
    <svg viewBox="0 0 200 88" style={{ width: '100%', display: 'block' }}>
      <path
        d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"
      />
      {dot && progress > 0 && (
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${dot.x} ${dot.y}`}
          fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"
        />
      )}
      <line x1={CX - R - 8} y1={CY} x2={CX + R + 8} y2={CY} stroke="var(--border)" strokeWidth="1" />
      {dot && children(dot)}
    </svg>
  );
}

function TimeLabel({ value, caption, note, align = 'left' }) {
  return (
    <div style={{ textAlign: align }}>
      <div style={VALUE_STYLE}>{value}</div>
      <div style={CAPTION_STYLE}>{caption}</div>
      {note && <div style={NOTE_STYLE}>{note}</div>}
    </div>
  );
}

function SunIcon() {
  return (
    <>
      <circle r="11" fill="rgba(245,197,24,0.18)" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line key={deg}
            x1={Math.cos(rad) * 6} y1={Math.sin(rad) * 6}
            x2={Math.cos(rad) * 9} y2={Math.sin(rad) * 9}
            stroke={SUN_COLOR} strokeWidth="1.5" strokeLinecap="round"
          />
        );
      })}
      <circle r="4" fill={SUN_COLOR} />
    </>
  );
}

function MoonPhaseIcon({ phase, cx, cy, r = 9 }) {
  const offX = r * Math.cos(phase * 2 * Math.PI);
  const isWaxing = phase < 0.5;
  const clipX = isWaxing ? cx - r : cx;
  const id = `moon-clip-${Math.round(phase * 1000)}`;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 3} fill="rgba(176,196,222,0.15)" />
      <circle cx={cx} cy={cy} r={r} fill="#dce8f5" />
      <clipPath id={id}>
        <rect x={clipX} y={cy - r} width={r} height={r * 2} />
      </clipPath>
      <circle cx={cx + offX} cy={cy} r={r} fill="#1e2840" clipPath={`url(#${id})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(176,196,222,0.35)" strokeWidth="0.5" />
    </g>
  );
}

function SunCard({ times, now }) {
  const { sunrise, sunset, dawn, dusk } = times;
  const progress = arcProgress(sunrise?.getTime(), sunset?.getTime(), now.getTime());
  const daylight = fmtDaylight(sunrise, sunset);
  return (
    <div className="y-card">
      <div className="y-label">Sun</div>
      <ArcTrack progress={progress} color={SUN_COLOR}>
        {dot => <g transform={`translate(${dot.x}, ${dot.y})`}><SunIcon /></g>}
      </ArcTrack>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <TimeLabel value={fmtSunTime(sunrise)} caption="Sunrise" note={`${fmtSunTime(dawn)} first light`} />
        <TimeLabel value={fmtSunTime(sunset)} caption="Sunset" note={`last light ${fmtSunTime(dusk)}`} align="right" />
      </div>
      {daylight && (
        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
          {daylight}
        </div>
      )}
    </div>
  );
}

function MoonCard({ lat, lon, now }) {
  const win   = resolveMoonWindow(lat, lon, now);
  const illum = SunCalc.getMoonIllumination(now);
  const progress = arcProgress(win.rise?.getTime(), win.set?.getTime(), now.getTime());

  const riseText = win.alwaysDown ? '--'
    : win.rise ? fmtMoonTime(win.rise)
    : win.moonUp ? 'Already up' : '--';
  const setText = win.alwaysUp ? 'Always up'
    : win.alwaysDown ? 'Always down'
    : fmtMoonTime(win.set);

  return (
    <div className="y-card">
      <div className="y-label">Moon</div>
      <ArcTrack progress={progress} color={MOON_COLOR}>
        {dot => <MoonPhaseIcon phase={illum.phase} cx={dot.x} cy={dot.y} r={9} />}
      </ArcTrack>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <TimeLabel value={riseText} caption="Moonrise" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--tp)' }}>{moonPhaseName(illum.phase)}</div>
          <div style={{ fontSize: 9, color: 'var(--tm)', marginTop: 1 }}>{Math.round(illum.fraction * 100)}% illuminated</div>
        </div>
        <TimeLabel value={setText} caption="Moonset" align="right" />
      </div>
    </div>
  );
}

// Sunrise/sunset arc by day; flips to the moon card after dusk.
export default function SunMoonCard({ lat, lon }) {
  if (lat == null || lon == null) return null;
  const now = new Date();
  const times = SunCalc.getTimes(now, lat, lon);
  const pastDusk = times.dusk instanceof Date && isFinite(times.dusk) && now > times.dusk;
  return pastDusk
    ? <MoonCard lat={lat} lon={lon} now={now} />
    : <SunCard times={times} now={now} />;
}
