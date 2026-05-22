import { useState, useEffect } from 'react';
import { CONDITION_PREVIEWS } from '../themes.js';

const WEATHER_THEMES = new Set(['sunny', 'cloudy', 'rainy', 'stormy']);

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
      flexShrink: 0, transition: 'all var(--tr-fast)',
    }}>
      {selected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bg)' }} />}
    </div>
  );
}

function StationForm({ userSettings, isSaving, onSave }) {
  const [stationId, setStationId]   = useState(userSettings?.station_id ?? '');
  const [stationLabel, setStationLabel] = useState(userSettings?.station_label ?? '');
  const [twcApiKey, setTwcApiKey]   = useState('');
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | success | error
  const [saveError, setSaveError]   = useState('');

  const isNew = !userSettings;
  const hasChanges = stationId !== (userSettings?.station_id ?? '') ||
                     stationLabel !== (userSettings?.station_label ?? '') ||
                     twcApiKey.trim() !== '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stationId.trim()) return;
    if (isNew && !twcApiKey.trim()) return;

    setSaveStatus('idle');
    setSaveError('');

    const payload = { stationId: stationId.trim(), stationLabel: stationLabel.trim() };
    if (twcApiKey.trim()) payload.twcApiKey = twcApiKey.trim();
    // If updating and no new key entered, pass the old encrypted key indicator
    if (!isNew && !twcApiKey.trim()) {
      // No key change — send a sentinel so the server keeps the existing key.
      // We handle this by just omitting twcApiKey when it's unchanged.
      // But our POST handler requires twcApiKey... we'll need to either:
      // 1. Make twcApiKey optional on update, OR
      // 2. Always require it.
      // For simplicity, require it on first save only and make it optional on update.
      // The server will skip re-encrypting if twcApiKey is absent.
    }

    const result = await onSave(payload);
    if (result.success) {
      setSaveStatus('success');
      setTwcApiKey('');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } else {
      setSaveStatus('error');
      setSaveError(result.error ?? 'Save failed');
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 10, fontSize: 13, color: 'var(--tp)',
    fontFamily: 'var(--font-mono)', outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: 11, color: 'var(--ts)', marginBottom: 5,
    display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px',
  };

  return (
    <form onSubmit={handleSubmit}>
      {isNew && (
        <div style={{
          background: 'var(--soft)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 12px', marginBottom: 14,
          fontSize: 12, color: 'var(--ts)', lineHeight: 1.5,
        }}>
          Connect your Weather Underground station to see live data.
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Station ID</label>
        <input
          style={inputStyle}
          placeholder="e.g. KFLMIAMI123"
          value={stationId}
          onChange={e => setStationId(e.target.value)}
          required
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Station Label (optional)</label>
        <input
          style={{ ...inputStyle, fontFamily: 'var(--font-body)' }}
          placeholder="e.g. Backyard"
          value={stationLabel}
          onChange={e => setStationLabel(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>TWC API Key {!isNew && '(leave blank to keep existing)'}</label>
        <input
          style={inputStyle}
          type="password"
          placeholder={isNew ? 'Your Weather Company API key' : '••••••••  (unchanged)'}
          value={twcApiKey}
          onChange={e => setTwcApiKey(e.target.value)}
          required={isNew}
          autoComplete="off"
        />
      </div>

      {saveStatus === 'error' && (
        <div style={{
          fontSize: 12, color: '#dc2626', marginBottom: 10,
          background: '#fef2f2', borderRadius: 8, padding: '8px 12px',
        }}>
          {saveError}
        </div>
      )}

      {saveStatus === 'success' && (
        <div style={{
          fontSize: 12, color: '#16a34a', marginBottom: 10,
          background: '#f0fdf4', borderRadius: 8, padding: '8px 12px',
        }}>
          Station saved.
        </div>
      )}

      <button
        type="submit"
        disabled={isSaving || (!hasChanges && !isNew)}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 12,
          background: 'var(--accent)', border: 'none',
          color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: isSaving ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-body)',
          opacity: (isSaving || (!hasChanges && !isNew)) ? 0.6 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {isSaving ? 'Saving…' : isNew ? 'Connect Station' : 'Save Changes'}
      </button>
    </form>
  );
}

export default function SettingsDrawer({
  onClose, mode, onSetMode, autoTheme, previewCondition, onSetPreview, stationId,
  user, userSettings, isSaving, onSaveSettings, onSignOut,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activePreview = previewCondition
    ? CONDITION_PREVIEWS.find(x => x.id === previewCondition) ?? null
    : null;

  const autoLabel = autoTheme
    ? WEATHER_THEMES.has(autoTheme)
      ? `Auto-synced · ${autoTheme.charAt(0).toUpperCase() + autoTheme.slice(1)} conditions`
      : `Auto-synced · ${autoTheme.charAt(0).toUpperCase() + autoTheme.slice(1)} mode`
    : 'Auto-synced to current conditions';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          background: previewCondition ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.5)',
          backdropFilter: previewCondition ? 'blur(2px)' : 'blur(5px)',
          zIndex: 190,
          transition: 'background 0.35s, backdrop-filter 0.35s',
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {CONDITION_PREVIEWS.map(c => {
                const isActive = previewCondition === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSetPreview(isActive ? null : c.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '10px 4px',
                      background: c.bg,
                      border: `2px solid ${isActive ? c.accent : 'transparent'}`,
                      borderRadius: 12,
                      cursor: 'pointer',
                      fontSize: 9, color: isActive ? c.accent : c.text,
                      letterSpacing: '0.5px', textTransform: 'uppercase',
                      transition: 'border-color var(--tr-fast), color var(--tr-fast)',
                      fontFamily: 'var(--font-body)',
                      boxShadow: isActive ? `0 0 0 3px ${c.accent}33` : 'none',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{c.icon}</span>
                    {c.label}
                  </button>
                );
              })}
            </div>

            {activePreview && (
              <div style={{ marginTop: 10, borderRadius: 16, overflow: 'hidden', border: `1px solid ${activePreview.accent}55` }}>
                <div style={{
                  background: activePreview.hero,
                  padding: '18px 18px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: activePreview.text, fontWeight: 500 }}>
                      Theme Preview
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: activePreview.text, marginTop: 6, letterSpacing: '-0.5px', fontFamily: 'var(--font-display)' }}>
                      {activePreview.label}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {[activePreview.bg, activePreview.accent, activePreview.text].map((c, i) => (
                        <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '1.5px solid rgba(255,255,255,0.25)' }} />
                      ))}
                    </div>
                  </div>
                  <span style={{ fontSize: 56, lineHeight: 1, opacity: 0.9 }} aria-hidden="true">
                    {activePreview.icon}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Station section */}
        <div style={{ marginBottom: 22 }}>
          <div className="y-label">Station</div>

          {user ? (
            <StationForm
              userSettings={userSettings}
              isSaving={isSaving}
              onSave={onSaveSettings}
            />
          ) : (
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
          )}
        </div>

        {/* Account section — only when signed in */}
        {user && (
          <div style={{ marginBottom: 22 }}>
            <div className="y-label">Account</div>
            <div className="y-pref-row" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 18, width: 22, textAlign: 'center' }}>👤</div>
                <div style={{ fontSize: 13, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
                  {user.email}
                </div>
              </div>
            </div>
            <button
              onClick={onSignOut}
              style={{
                width: '100%', marginTop: 8, padding: '12px 0', borderRadius: 12,
                background: 'var(--soft)', border: '1px solid var(--border)',
                color: 'var(--ts)', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              Sign Out
            </button>
          </div>
        )}

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
