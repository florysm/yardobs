import { useState, useEffect } from 'react';
import { CONDITION_PREVIEWS, WEATHER_THEME_IDS, DISPLAY_MODES } from '../themes.js';
import { ACTIVITIES } from '../utils/activities';
import { UNITS } from '../utils/units';
import ChangelogModal from './ChangelogModal';
import StationForm from './StationForm';

const UNIT_OPTIONS = [
  { id: UNITS.IMPERIAL, label: '°F, mph, in' },
  { id: UNITS.METRIC,   label: '°C, km/h, mm' },
];

const MODES = [
  { id: DISPLAY_MODES.LIGHT, icon: '☀', label: 'Always Light', desc: 'I prefer light regardless of conditions' },
  { id: DISPLAY_MODES.DARK,  icon: '☾', label: 'Always Dark',  desc: 'I prefer dark regardless of conditions' },
  { id: DISPLAY_MODES.AUTO,  icon: '🔮', label: 'Match Conditions', desc: 'Theme follows current weather' },
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


export default function SettingsDrawer({
  onClose, mode, onSetMode, autoTheme, previewCondition, onSetPreview,
  profile, onSaveProfile,
  defaultActivity, onSetDefaultActivity,
  units, onSetUnits,
  isExploring, onClearExplore,
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
    ? WEATHER_THEME_IDS.has(autoTheme)
      ? `Auto-synced · ${autoTheme.charAt(0).toUpperCase() + autoTheme.slice(1)} conditions`
      : `Auto-synced · ${autoTheme.charAt(0).toUpperCase() + autoTheme.slice(1)} mode`
    : 'Auto-synced to current conditions';

  const [showChangelog, setShowChangelog] = useState(false);

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
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        style={{
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

        {/* Exploring banner — station user browsing another location */}
        {isExploring && (
          <div style={{
            marginBottom: 22,
            background: 'var(--soft)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '12px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
                Exploring
              </div>
              <div style={{ fontSize: 13, color: 'var(--tp)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                {profile?.exploring?.label ?? 'Unknown location'}
              </div>
            </div>
            <button
              onClick={() => { onClearExplore(); onClose(); }}
              style={{
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
                color: 'var(--accent)', background: 'none',
                border: '1px solid var(--accent)', borderRadius: 20,
                padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ← My Station
            </button>
          </div>
        )}

        {/* Display Mode section */}
        <div style={{ marginBottom: 22 }}>
          <div className="y-label">Display Mode</div>

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
        {mode === DISPLAY_MODES.AUTO && (
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

        {/* Default Activity section */}
        <div style={{ marginBottom: 22 }}>
          <div className="y-label">Default Activity</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ACTIVITIES.map(a => {
              const isActive = defaultActivity === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => onSetDefaultActivity(a.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px',
                    background: isActive ? 'var(--accent)' : 'var(--soft)',
                    border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#fff' : 'var(--tp)',
                    fontFamily: 'var(--font-body)',
                    boxShadow: isActive ? '0 0 0 3px var(--glow)' : 'none',
                    transition: 'all var(--tr-fast)',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{a.icon}</span>
                  {a.short}
                </button>
              );
            })}
          </div>
        </div>

        {/* Units section */}
        <div style={{ marginBottom: 22 }}>
          <div className="y-label">Units</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {UNIT_OPTIONS.map(u => {
              const isActive = units === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => onSetUnits(u.id)}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    textAlign: 'center',
                    background: isActive ? 'var(--accent)' : 'var(--soft)',
                    border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#fff' : 'var(--tp)',
                    fontFamily: 'var(--font-body)',
                    boxShadow: isActive ? '0 0 0 3px var(--glow)' : 'none',
                    transition: 'all var(--tr-fast)',
                  }}
                >
                  {u.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Station section */}
        <div style={{ marginBottom: 22 }}>
          <div className="y-label">Station</div>
          <StationForm
            initialStationId={profile?.stationId ?? ''}
            onSave={(sid) => onSaveProfile({ mode: 'station', stationId: sid })}
          />
        </div>

        {/* Support section */}
        <div style={{ marginBottom: 22 }}>
          <div className="y-label">Support</div>
          <a
            href="https://ko-fi.com/yardobs"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <div className="y-pref-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 18, width: 22, textAlign: 'center' }}>☕</div>
                <div>
                  <div style={{ fontSize: 13, color: 'var(--tp)', fontWeight: 500 }}>Support YardObs</div>
                  <div style={{ fontSize: 11, color: 'var(--ts)', marginTop: 1 }}>Buy me a coffee ♥</div>
                </div>
              </div>
            </div>
          </a>
        </div>

        {/* Version */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <button
            onClick={() => setShowChangelog(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: 'var(--ts)',
              fontFamily: 'var(--font-body)', padding: '4px 8px',
              opacity: 0.7,
            }}
          >
            v{__APP_VERSION__} · What's new
          </button>
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

      {showChangelog && (
        <ChangelogModal
          onClose={() => setShowChangelog(false)}
          stationId={profile?.stationId ?? null}
          isPreview={profile?.mode === 'preview'}
        />
      )}
    </>
  );
}
