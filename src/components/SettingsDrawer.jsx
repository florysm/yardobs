import { useEffect } from 'react';

const CONDITION_PREVIEWS = [
  { id: 'sunny',  label: 'Sunny',  icon: '☀️' },
  { id: 'cloudy', label: 'Cloudy', icon: '☁️' },
  { id: 'rainy',  label: 'Rainy',  icon: '🌧️' },
  { id: 'stormy', label: 'Stormy', icon: '⛈️' },
];

const MODES = [
  { id: 'light', icon: '☀', label: 'Always Light', desc: 'I prefer light regardless of conditions' },
  { id: 'dark',  icon: '☾', label: 'Always Dark',  desc: 'I prefer dark regardless of conditions' },
  { id: 'auto',  icon: '🔮', label: 'Match Conditions', desc: 'Theme follows current weather' },
];

function RadioDot({ selected }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%',
      border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
      background: selected ? 'var(--accent)' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, transition: 'all 0.2s',
    }}>
      {selected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
    </div>
  );
}

export default function SettingsDrawer({
  onClose, mode, onSetMode, autoTheme, previewCondition, onSetPreview, stationId,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const autoLabel = autoTheme
    ? `Auto-synced · ${autoTheme.charAt(0).toUpperCase() + autoTheme.slice(1)} conditions`
    : 'Auto-synced to current conditions';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
          zIndex: 190, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxWidth: 420, margin: '0 auto',
        background: 'var(--bg)', borderRadius: '24px 24px 0 0',
        borderTop: '1px solid var(--border)',
        zIndex: 200, padding: '0 20px 36px',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto 20px' }} />

        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--tp)', marginBottom: 4 }}>
          Preferences
        </div>
        <div style={{ fontSize: 12, color: 'var(--ts)', marginBottom: 20, lineHeight: 1.5 }}>
          Theme adapts to your conditions by default. Override anytime.
        </div>

        {/* Display Mode section */}
        <div style={{ marginBottom: 22 }}>
          <div className="y-label">Display Mode</div>

          {/* Auto indicator pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', background: 'var(--soft)',
            border: '1px solid var(--border)', borderRadius: 12,
            fontSize: 12, color: 'var(--ts)', marginBottom: 10,
          }}>
            <span className="live-dot" />
            <span>{autoLabel}</span>
          </div>

          {MODES.map(m => (
            <div key={m.id} className="y-pref-row" onClick={() => onSetMode(m.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{m.icon}</div>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--tp)', fontWeight: 500 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--ts)', marginTop: 1 }}>{m.desc}</div>
                </div>
              </div>
              <RadioDot selected={mode === m.id} />
            </div>
          ))}
        </div>

        {/* Condition preview chips — only in auto mode */}
        {mode === 'auto' && (
          <div style={{ marginBottom: 22 }}>
            <div className="y-label">Preview Conditions</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {CONDITION_PREVIEWS.map(c => {
                const isActive = previewCondition === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSetPreview(isActive ? null : c.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '10px 4px',
                      background: isActive ? 'var(--soft)' : 'var(--card)',
                      border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontSize: 9, color: isActive ? 'var(--accent)' : 'var(--tm)',
                      letterSpacing: '0.5px', textTransform: 'uppercase',
                      transition: 'all 0.2s',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{c.icon}</span>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Station section */}
        <div style={{ marginBottom: 22 }}>
          <div className="y-label">Station</div>
          <div className="y-pref-row" style={{ cursor: 'default' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 18, width: 22, textAlign: 'center' }}>📡</div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--tp)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                  {stationId ?? 'Not configured'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ts)', marginTop: 1 }}>
                  Set VITE_PWS_STATION_ID in .env
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Done button */}
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 16,
            background: 'var(--accent)', border: 'none',
            color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            boxShadow: '0 4px 14px var(--glow)',
          }}
        >
          Done
        </button>
      </div>
    </>
  );
}
