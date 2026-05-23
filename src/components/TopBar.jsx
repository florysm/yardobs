import { useState, useEffect } from 'react';

function timeAgo(date) {
  if (!date) return null;
  const mins = Math.round((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} min ago`;
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function TopBar({ profile, lastUpdated, onSettingsOpen, neighborhood }) {
  const [ago, setAgo] = useState(() => timeAgo(lastUpdated));

  useEffect(() => {
    setAgo(timeAgo(lastUpdated));
    const tick = setInterval(() => setAgo(timeAgo(lastUpdated)), 30_000);
    return () => clearInterval(tick);
  }, [lastUpdated]);

  const isPreview = profile?.mode === 'preview';
  const stationId = profile?.stationId ?? null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
      {/* App name + location/station subtitle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.5px',
          color: 'var(--tp)',
          lineHeight: 1,
        }}>
          Yard<span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>Obs</span>
        </div>

        {isPreview ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 11,
              color: 'var(--tm)',
              letterSpacing: '0.3px',
              fontFamily: 'var(--font-mono)',
            }}>
              Preview: {profile.label ?? 'Your Location'}
            </span>
            <button
              onClick={onSettingsOpen}
              style={{
                fontSize: 9,
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.3px',
                background: 'var(--soft)',
                border: '1px solid var(--border)',
                borderRadius: 50,
                padding: '2px 7px',
                cursor: 'pointer',
                lineHeight: 1.6,
                fontWeight: 600,
              }}
            >
              Connect →
            </button>
          </div>
        ) : (
          <div style={{
            fontSize: 11,
            color: 'var(--tm)',
            letterSpacing: '0.5px',
            fontFamily: 'var(--font-mono)',
          }}>
            {neighborhood ?? stationId ?? 'No station set'}
          </div>
        )}
      </div>

      {/* Right: live pill + settings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {ago && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 50,
            border: '1px solid var(--border)', background: 'var(--card)',
            fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)',
            letterSpacing: '0.5px', backdropFilter: 'blur(8px)',
          }}>
            <span className="live-dot" />
            <span>{ago}</span>
          </div>
        )}
        <button
          onClick={onSettingsOpen}
          aria-label="Open settings"
          className="topbar-settings-btn"
        >
          <GearIcon />
        </button>
      </div>
    </div>
  );
}
