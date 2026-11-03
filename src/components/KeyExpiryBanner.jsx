import { keyExpiryStatus, expiryMessage, KEY_RENEW_URL } from '../utils/keyExpiry';

// Reminder strip for station owners whose recorded TWC key expiration date is
// within two weeks (amber) or has passed (red). Renders nothing otherwise.
// "Renew" goes to the wunderground.com keys page; "Update key" opens Settings
// where the new key and date are entered.
export default function KeyExpiryBanner({ keyExpires, onOpenSettings }) {
  const message = expiryMessage(keyExpires);
  if (!message) return null;

  const color = keyExpiryStatus(keyExpires).state === 'expired' ? '#dc2626' : '#d97706';
  const linkStyle = {
    fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)', color,
    background: 'none', border: `1px solid ${color}`, borderRadius: 20,
    padding: '4px 10px', cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
  };

  return (
    <div
      role="status"
      style={{
        borderLeft: `4px solid ${color}`,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        padding: '8px 20px 8px 16px', margin: '0 0 4px',
      }}
    >
      <div style={{ display: 'flex', gap: 8, fontSize: 12.5, fontWeight: 600, color, lineHeight: 1.4 }}>
        <span aria-hidden="true" style={{ fontSize: 14 }}>🔑</span>
        <span>{message}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingLeft: 22 }}>
        <a href={KEY_RENEW_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>Renew key ↗</a>
        <button type="button" onClick={onOpenSettings} style={linkStyle}>Update in Settings</button>
      </div>
    </div>
  );
}
