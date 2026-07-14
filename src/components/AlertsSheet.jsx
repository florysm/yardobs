import { useState, useEffect } from 'react';
import { severityColor } from '../utils/alerts';
import { getLocaleHour12 } from '../utils/format';

// Locale-aware alert timestamp, e.g. "Tue 6:45 PM" (12h) or "Tue 18:45" (24h).
function fmtAlertTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(navigator.language, {
      weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: getLocaleHour12(),
    });
  } catch {
    return null;
  }
}

function AlertRow({ alert, expanded, onToggle }) {
  const color = severityColor(alert.severity);
  const onset = fmtAlertTime(alert.onset);
  const expires = fmtAlertTime(alert.expires);
  const timing = expires
    ? `${onset ? `${onset} – ` : 'Until '}${expires}`
    : (onset ? `From ${onset}` : null);

  return (
    <div style={{
      border: '1px solid var(--border)', borderLeft: `4px solid ${color}`,
      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
          background: 'var(--card)', border: 'none', cursor: 'pointer',
          padding: '12px 14px', textAlign: 'left', fontFamily: 'var(--font-body)',
        }}
      >
        <span aria-hidden="true" style={{ color, fontSize: 15, marginTop: 1, flexShrink: 0 }}>⚠</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tp)' }}>{alert.event}</div>
          {timing && (
            <div style={{ fontSize: 11, color: 'var(--ts)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              {timing}
            </div>
          )}
        </div>
        <span aria-hidden="true" style={{
          fontSize: 13, color: 'var(--tm)', flexShrink: 0, marginTop: 2,
          transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
        }}>⌄</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px', background: 'var(--card)' }}>
          {alert.headline && (
            <div style={{ fontSize: 12.5, color: 'var(--tp)', fontWeight: 500, marginBottom: 8, lineHeight: 1.5 }}>
              {alert.headline}
            </div>
          )}
          {alert.description && (
            <div style={{
              fontSize: 12, color: 'var(--ts)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
              maxHeight: 240, overflowY: 'auto',
            }}>
              {alert.description}
            </div>
          )}
          {alert.instruction && (
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)',
              fontSize: 12, color: 'var(--tp)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>
              <span style={{ fontWeight: 600 }}>What to do: </span>{alert.instruction}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AlertsSheet({ alerts, onClose }) {
  const [expandedId, setExpandedId] = useState(alerts?.[0]?.id ?? null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = alerts ?? [];

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(5px)', zIndex: 190,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Weather alerts"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          maxWidth: 420, margin: '0 auto',
          background: 'var(--bg)', borderRadius: '24px 24px 0 0',
          borderTop: '1px solid var(--border)',
          zIndex: 200, padding: '0 20px 36px',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto 20px' }} />

        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--tp)', marginBottom: 4 }}>
          {list.length === 1 ? 'Weather Alert' : `Weather Alerts (${list.length})`}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ts)', marginBottom: 20, lineHeight: 1.5 }}>
          Active advisories for this location, most severe first. Source: U.S. National Weather Service.
        </div>

        {list.map(a => (
          <AlertRow
            key={a.id}
            alert={a}
            expanded={expandedId === a.id}
            onToggle={() => setExpandedId(id => (id === a.id ? null : a.id))}
          />
        ))}
      </div>
    </>
  );
}
