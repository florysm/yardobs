import { useState, useEffect } from 'react';
import { CONDITION_PREVIEWS, WEATHER_THEME_IDS, DISPLAY_MODES } from '../themes.js';
import { ACTIVITIES } from '../utils/activities';
import { PROFILE_MODES, isStationProfile, isPreviewProfile } from '../utils/profile';
import { UNITS } from '../utils/units';
import { STORAGE_KEYS, readStored } from '../utils/storageKeys';
import { buildWidgetScript, buildWidgetUpdatePayload, widgetConfigFromSettings, WIDGET_TEMPLATE_URL, WIDGET_UPDATE_URL, SCRIPTABLE_APP_URL } from '../utils/widgetScript';
import ChangelogModal from './ChangelogModal';
import StationForm, { DeviceLinkForm } from './StationForm';
import Collapsible from './Collapsible';
import { useWindowSize } from '../hooks/useWindowSize';
import { stationSummary, SETTINGS_PANEL_MIN_WIDTH } from '../utils/settingsSummary';
import { DASHBOARD_SIZES, SIZE_LABELS, resolveForWindow } from '../utils/dashboardSize';

const UNIT_OPTIONS = [
  { id: UNITS.IMPERIAL, label: '°F, mph, in' },
  { id: UNITS.METRIC,   label: '°C, km/h, mm' },
];

const MODES = [
  { id: DISPLAY_MODES.AUTO,  label: 'Match' },
  { id: DISPLAY_MODES.LIGHT, label: 'Light' },
  { id: DISPLAY_MODES.DARK,  label: 'Dark' },
];

// A row of mutually exclusive buttons (theme, units, layout, size).
function Segmented({ options, value, onChange, label }) {
  return (
    <div className="y-seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={String(o.id)} type="button" className="y-seg-btn"
          aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const sectionStyle = { marginBottom: 20 };
const hintStyle = { fontSize: 11, color: 'var(--tm)', marginTop: 6, lineHeight: 1.5 };

export default function SettingsDrawer({
  onClose, mode, onSetMode, autoTheme, previewCondition, onSetPreview,
  profile, onSaveProfile,
  defaultActivity, onSetDefaultActivity,
  units, onSetUnits,
  isExploring, onClearExplore,
  dashboard, onSetDashboard,
  dashboardSize = 'auto', onSetDashboardSize,
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
  const win = useWindowSize();
  const wide = win.w >= SETTINGS_PANEL_MIN_WIDTH;
  const [widgetCopy, setWidgetCopy] = useState(null); // null | 'copied' | error message

  const twcKey = readStored(STORAGE_KEYS.TWC_API_KEY, '');
  const keyExpires = readStored(STORAGE_KEYS.TWC_KEY_EXPIRES);
  const widgetConfig = widgetConfigFromSettings({ profile, twcKey, keyExpires, units });
  const station = stationSummary({
    stationId: isStationProfile(profile) ? profile.stationId : '',
    hasKey: !!twcKey,
    expires: keyExpires,
  });

  const copyWidgetScript = async () => {
    const scriptBlob = fetch(WIDGET_TEMPLATE_URL)
      .then(r => { if (!r.ok) throw new Error('Could not load the widget script'); return r.text(); })
      .then(template => new Blob([buildWidgetScript(template, widgetConfig)], { type: 'text/plain' }));
    scriptBlob.catch(() => {}); // surfaced through the clipboard call below
    try {
      // Safari drops the click's user activation across an await, so hand the
      // clipboard a pending item rather than awaiting the fetch first.
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': scriptBlob })]);
      } else {
        await navigator.clipboard.writeText(await (await scriptBlob).text());
      }
      setWidgetCopy('copied');
    } catch (err) {
      setWidgetCopy(err?.message || 'Copy failed — try again');
    }
  };

  // For a widget that's already installed: hand the new settings over through
  // the clipboard and run the script, which saves them in Scriptable's Keychain.
  // No re-pasting, and the key never goes into the URL.
  const updateWidget = async () => {
    try {
      await navigator.clipboard.writeText(buildWidgetUpdatePayload(widgetConfig));
      window.location.href = WIDGET_UPDATE_URL;
    } catch {
      setWidgetCopy('Couldn’t open Scriptable — copy the script again instead');
    }
  };

  // Phones: a bottom sheet. Tablets and computers: a full-height panel on the
  // right, so a dashboard stays in view (dimmed) beside it. Either way, tapping
  // the dimmed area closes it. The dim layer is sized with top/right/bottom/left
  // (iOS 10 ignores `inset`) and has cursor:pointer, without which iOS Safari
  // doesn't deliver taps on a plain div.
  const panelStyle = wide
    ? {
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 400, maxWidth: '90vw',
        borderRadius: '24px 0 0 24px', borderLeft: '1px solid var(--border)',
      }
    : {
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxWidth: 420, margin: '0 auto', maxHeight: '85vh',
        borderRadius: '24px 24px 0 0', borderTop: '1px solid var(--border)',
      };

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
          background: previewCondition ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.5)',
          backdropFilter: previewCondition ? 'blur(2px)' : 'blur(5px)',
          WebkitBackdropFilter: previewCondition ? 'blur(2px)' : 'blur(5px)',
          zIndex: 190, cursor: 'pointer',
          transition: 'background 0.35s',
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        style={{
          ...panelStyle,
          background: 'var(--bg)', zIndex: 200,
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '0 20px 28px',
        }}
      >
        {/* Header stays put while the rest scrolls */}
        <div className="y-sheet-header" style={{ padding: wide ? '18px 20px 12px' : '10px 20px 12px' }}>
          {!wide && <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 10px' }} />}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--tp)' }}>Preferences</div>
            <button type="button" onClick={onClose} style={{
              padding: '7px 16px', borderRadius: 18, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-body)', cursor: 'pointer',
            }}>
              Done
            </button>
          </div>
        </div>

        {/* Exploring banner — station user browsing another location */}
        {isExploring && (
          <div style={{
            marginBottom: 22,
            background: 'var(--soft)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '12px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
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
                padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: 10,
              }}
            >
              ← My Station
            </button>
          </div>
        )}

        {/* Theme */}
        <div style={sectionStyle}>
          <div className="y-label">Theme</div>
          <Segmented label="Theme" options={MODES} value={mode} onChange={onSetMode} />
          <div style={{ ...hintStyle, display: 'flex', alignItems: 'center' }}>
            {mode === DISPLAY_MODES.AUTO && <span className="live-dot" style={{ marginRight: 6 }} />}
            <span>{mode === DISPLAY_MODES.AUTO ? autoLabel : 'Fixed, whatever the weather.'}</span>
          </div>

          {mode === DISPLAY_MODES.AUTO && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--ts)', marginBottom: 6 }}>Preview a theme</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gridGap: 6, gap: 6 }}>
                {CONDITION_PREVIEWS.map(c => {
                  const isActive = previewCondition === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSetPreview(isActive ? null : c.id)}
                      aria-label={`Preview ${c.label}`}
                      aria-pressed={isActive}
                      title={c.label}
                      style={{
                        padding: '8px 0', background: c.bg,
                        border: `2px solid ${isActive ? c.accent : 'var(--border)'}`,
                        borderRadius: 10, cursor: 'pointer', fontSize: 18, lineHeight: 1,
                        boxShadow: isActive ? `0 0 0 3px ${c.accent}33` : 'none',
                      }}
                    >
                      {c.icon}
                    </button>
                  );
                })}
              </div>
              {activePreview && (
                <div style={{ marginTop: 10, borderRadius: 16, overflow: 'hidden', border: `1px solid ${activePreview.accent}55` }}>
                  <div style={{
                    background: activePreview.hero,
                    padding: '12px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: activePreview.text, fontWeight: 500 }}>
                        Theme Preview
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 600, color: activePreview.text, marginTop: 6, letterSpacing: '-0.5px', fontFamily: 'var(--font-display)' }}>
                        {activePreview.label}
                      </div>
                      <div style={{ display: 'flex', marginTop: 10 }}>
                        {[activePreview.bg, activePreview.accent, activePreview.text].map((c, i) => (
                          <div key={i} style={{ marginRight: 6, width: 14, height: 14, borderRadius: '50%', background: c, border: '1.5px solid rgba(255,255,255,0.25)' }} />
                        ))}
                      </div>
                    </div>
                    <span style={{ fontSize: 40, lineHeight: 1, opacity: 0.9 }} aria-hidden="true">
                      {activePreview.icon}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Default activity */}
        <div style={sectionStyle}>
          <div className="y-label">Default Activity</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', margin: '0 -3px' }}>
            {ACTIVITIES.map(a => {
              const isActive = defaultActivity === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSetDefaultActivity(a.id)}
                  aria-pressed={isActive}
                  style={{
                    margin: 3, padding: '7px 12px',
                    background: isActive ? 'var(--accent)' : 'var(--soft)',
                    border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 20, cursor: 'pointer',
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#fff' : 'var(--tp)',
                    fontFamily: 'var(--font-body)',
                    transition: 'all var(--tr-fast)',
                  }}
                >
                  <span style={{ fontSize: 14, marginRight: 5 }}>{a.icon}</span>
                  {a.short}
                </button>
              );
            })}
          </div>
        </div>

        {/* Units */}
        <div style={sectionStyle}>
          <div className="y-label">Units</div>
          <Segmented label="Units" options={UNIT_OPTIONS} value={units} onChange={onSetUnits} />
        </div>

        {/* Layout — only where a dashboard makes sense (or it's already on) */}
        {(wide || dashboard) && (
          <div style={sectionStyle}>
            <div className="y-label">Layout</div>
            <Segmented label="Layout" value={!!dashboard} onChange={onSetDashboard}
              options={[{ id: false, label: 'Phone' }, { id: true, label: 'Dashboard' }]} />
            {dashboard && onSetDashboardSize && (
              <div style={{ marginTop: 8 }}>
                <Segmented label="Dashboard size" value={dashboardSize} onChange={onSetDashboardSize}
                  options={DASHBOARD_SIZES.map(sz => ({ id: sz, label: SIZE_LABELS[sz] }))} />
              </div>
            )}
            <div style={hintStyle}>
              {dashboard
                ? `Large for across the room, Detailed for up close.${dashboardSize === 'auto' ? ` Auto picks ${SIZE_LABELS[resolveForWindow('auto')]} here.` : ''}`
                : 'Dashboard shows everything on one screen, for a tablet on a stand.'}
              {' '}This device only.
            </div>
          </div>
        )}

        {/* Set once, rarely changed: collapsed to one line each */}
        <div style={sectionStyle}>
          <div className="y-label">Station &amp; Devices</div>
          <Collapsible title="Station" summary={station.text} attention={station.needsAttention} defaultOpen={station.needsAttention}>
            <StationForm
              initialStationId={profile?.stationId ?? ''}
              onSave={(sid) => onSaveProfile({ mode: PROFILE_MODES.STATION, stationId: sid })}
            />
          </Collapsible>
          {isStationProfile(profile) && !!twcKey && (
            <Collapsible title="Set up another device" summary="Send a link">
              <DeviceLinkForm stationId={profile.stationId} dashboard={!!dashboard} />
            </Collapsible>
          )}
          <Collapsible title="Home Screen widget" summary="Scriptable">
            <div style={{
              padding: '12px 14px', background: 'var(--soft)',
              border: '1px solid var(--border)', borderRadius: 12,
              fontSize: 12, color: 'var(--ts)', lineHeight: 1.6,
            }}>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                <li>
                  Install{' '}
                  <a href={SCRIPTABLE_APP_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                    Scriptable
                  </a>{' '}
                  (free) from the App Store.
                </li>
                <li>Tap <strong style={{ color: 'var(--tp)' }}>Copy widget script</strong> below.</li>
                <li>In Scriptable, tap <strong style={{ color: 'var(--tp)' }}>+</strong>, paste, and name it “YardObs”.</li>
                <li>Long-press your home screen, add a Scriptable widget, then edit it and choose YardObs.</li>
              </ol>
              <button
                onClick={copyWidgetScript}
                disabled={!widgetConfig}
                style={{
                  width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 20,
                  background: widgetConfig ? 'var(--accent)' : 'var(--border)', border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: widgetConfig ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)',
                }}
              >
                {widgetCopy === 'copied' ? 'Copied ✓' : 'Copy widget script'}
              </button>
              <button
                onClick={updateWidget}
                disabled={!widgetConfig}
                style={{
                  width: '100%', marginTop: 8, padding: '9px 0', borderRadius: 20,
                  background: 'transparent', border: `1.5px solid ${widgetConfig ? 'var(--accent)' : 'var(--border)'}`,
                  color: widgetConfig ? 'var(--accent)' : 'var(--ts)', fontSize: 13, fontWeight: 600,
                  cursor: widgetConfig ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)',
                }}
              >
                Update installed widget
              </button>
              <div style={{ fontSize: 11, marginTop: 8 }}>
                {!widgetConfig
                  ? (isStationProfile(profile)
                      ? 'Save your station ID and TWC API key above to set up the widget.'
                      : 'Choose a location to set up the widget.')
                  : widgetCopy && widgetCopy !== 'copied'
                    ? widgetCopy
                    : isStationProfile(profile)
                      ? 'The script includes your TWC API key — don’t share it. After renewing your key or changing your station or units, tap Update installed widget.'
                      : 'After changing your location or units, tap Update installed widget.'}
              </div>
            </div>
          </Collapsible>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ts)', marginTop: 8 }}>
          <a href="https://ko-fi.com/yardobs" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--ts)', textDecoration: 'none' }}>
            ☕ Support YardObs
          </a>
          <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
          <button type="button" onClick={() => setShowChangelog(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 12, color: 'var(--ts)', fontFamily: 'var(--font-body)',
          }}>
            v{__APP_VERSION__} · What&apos;s new
          </button>
        </div>
      </div>

      {showChangelog && (
        <ChangelogModal
          onClose={() => setShowChangelog(false)}
          stationId={profile?.stationId ?? null}
          isPreview={isPreviewProfile(profile)}
        />
      )}
    </>
  );
}
