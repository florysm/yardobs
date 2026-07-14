import { severityColor } from '../utils/alerts';

// Slim, always-visible strip shown whenever the current location has active
// severe-weather alerts. Renders nothing when there are none. Tapping opens the
// full AlertsSheet. Colored by the worst active alert (alerts arrive sorted
// worst-first from normalizeAlerts).
export default function AlertBar({ alerts, onOpen }) {
  if (!alerts?.length) return null;

  const worst = alerts[0];
  const color = severityColor(worst.severity);
  const label = alerts.length > 1
    ? `${alerts.length} alerts · ${worst.event}`
    : worst.event;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${alerts.length} active weather ${alerts.length === 1 ? 'alert' : 'alerts'}. ${worst.event}. Tap for details.`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', border: 'none', borderLeft: `4px solid ${color}`, cursor: 'pointer',
        background: `color-mix(in srgb, ${color} 14%, transparent)`, color,
        padding: '8px 20px 8px 16px', margin: '0 0 4px',
        fontFamily: 'var(--font-body)', textAlign: 'left',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600,
        letterSpacing: '0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
      <span aria-hidden="true" style={{ fontSize: 15, opacity: 0.7, flexShrink: 0 }}>›</span>
    </button>
  );
}
