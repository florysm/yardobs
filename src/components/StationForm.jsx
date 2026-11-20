import { useState } from 'react';
import { STORAGE_KEYS, readStored, writeStored } from '../utils/storageKeys';
import { apiFetch } from '../utils/apiFetch';
import { isValidExpiryDate, daysUntilExpiry, KEY_RENEW_URL } from '../utils/keyExpiry';
import { cleanKey, keyShapeHint, buildDeviceLink, linkOrigin, readPastedLink, clearSetupHash } from '../utils/deviceSetup';

export default function StationForm({ initialStationId, onSave }) {
  const [stationId, setStationId] = useState(initialStationId ?? '');
  const [twcApiKey, setTwcApiKey] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | testing | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [showKey, setShowKey] = useState(false);

  const storedKey = readStored(STORAGE_KEYS.TWC_API_KEY, '');
  const hasKey = storedKey.length > 0;
  const storedExpiry = readStored(STORAGE_KEYS.TWC_KEY_EXPIRES, '');
  const [keyExpires, setKeyExpires] = useState(storedExpiry);
  const hasChanges = stationId.trim() !== (initialStationId ?? '') || twcApiKey.trim() !== '' || keyExpires !== storedExpiry;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const sid = stationId.trim();
    const key = twcApiKey.trim() || storedKey;
    if (!sid || !key) {
      setErrorMsg(!sid ? 'Station ID is required.' : 'API key is required.');
      setSaveStatus('error');
      return;
    }

    setSaveStatus('testing');
    setErrorMsg('');
    try {
      // Tests the key being entered, which isn't saved yet — apiFetch keeps a
      // caller's own key header instead of the stored one.
      await apiFetch(`/api/weather?type=current&stationId=${encodeURIComponent(sid)}`, {
        headers: { 'X-TWC-Key': key },
      });
    } catch (err) {
      // `status` means the server answered (bad key, unknown station); without
      // it the request never got there.
      // A rejected key that doesn't look like a TWC key is almost always a
      // typo, so say what's off rather than only "rejected".
      const hint = err?.status === 401 ? keyShapeHint(key) : null;
      setErrorMsg(err?.status
        ? (hint ? `${err.message}. ${hint}` : err.message)
        : 'Could not reach the server — check your connection.');
      setSaveStatus('error');
      return;
    }
    // Save credentials only after a successful test
    if (twcApiKey.trim()) writeStored(STORAGE_KEYS.TWC_API_KEY, twcApiKey.trim());
    // A new key with the old, already-passed date left in place would keep
    // warning about an expiry that no longer applies — drop it.
    let expiry = keyExpires;
    if (twcApiKey.trim() && expiry === storedExpiry && (daysUntilExpiry(expiry) ?? 0) < 0) expiry = '';
    writeStored(STORAGE_KEYS.TWC_KEY_EXPIRES, isValidExpiryDate(expiry) ? expiry : null);
    setKeyExpires(isValidExpiryDate(expiry) ? expiry : '');
    clearSetupHash();
    onSave(sid);
    setSaveStatus('success');
    setTwcApiKey('');
    setTimeout(() => setSaveStatus('idle'), 4000);
  };

  // A setup link pasted into the Station ID box fills in the station, key and
  // expiry from it; Test & Save then checks and saves them as usual. This is
  // the way in when a home-screen app opens without the link's data.
  const handleStationInput = (value) => {
    setSaveStatus('idle');
    const link = readPastedLink(value);
    if (!link) { setStationId(value); return; }
    setStationId(link.stationId);
    setTwcApiKey(link.key);
    if (link.expires) setKeyExpires(link.expires);
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
  const hintStyle = { fontSize: 11, color: 'var(--tm)', marginTop: 5, lineHeight: 1.5 };

  const isBusy = saveStatus === 'testing';

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Station ID</label>
        <input style={inputStyle} placeholder="e.g. KFLMIAMI123"
          value={stationId} onChange={e => handleStationInput(e.target.value)} required />
        <div style={hintStyle}>Your Weather Underground PWS station ID, or paste a setup link from another device</div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>
          TWC API Key{hasKey ? ' (leave blank to keep existing)' : ''}
        </label>
        <div style={{ position: 'relative' }}>
          {/* Cleaned as it's entered: pasted keys often carry spaces or
              invisible characters that TWC would reject. Shown as plain text
              on request, since a 32-character key typed blind is easy to get
              wrong; autocapitalize/autocorrect are off so iOS can't "fix" it. */}
          <input style={{ ...inputStyle, paddingRight: 64 }} type={showKey ? 'text' : 'password'}
            placeholder={hasKey ? '••••••••  (unchanged)' : 'Your Weather Company API key'}
            value={twcApiKey} onChange={e => { setTwcApiKey(cleanKey(e.target.value)); setSaveStatus('idle'); }}
            autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <button type="button" onClick={() => setShowKey(v => !v)}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)', padding: '6px 8px',
            }}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        {twcApiKey && (
          <div style={{ ...hintStyle, fontFamily: 'var(--font-mono)' }}>
            {twcApiKey.length} characters{keyShapeHint(twcApiKey) ? ` · ${keyShapeHint(twcApiKey)}` : ''}
          </div>
        )}
        <div style={hintStyle}>
          Get your TWC API key at{' '}
          <a href={KEY_RENEW_URL} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            wunderground.com/member/api-keys
          </a>
          {' '}(Weather Underground account required). Stored on this device only.
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Key Expires On (optional)</label>
        <input style={inputStyle} type="date"
          value={keyExpires} onChange={e => { setKeyExpires(e.target.value); setSaveStatus('idle'); }} />
        <div style={hintStyle}>
          Copy the expiration date from your API keys page and YardObs will remind you two weeks before it stops working.
        </div>
      </div>
      {saveStatus === 'success' && (
        <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 10, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px' }}>
          Connected to {stationId || initialStationId}.
        </div>
      )}
      {saveStatus === 'error' && (
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10, background: '#fef2f2', borderRadius: 8, padding: '8px 12px' }}>
          {errorMsg}
        </div>
      )}
      <button type="submit" disabled={!hasChanges || isBusy} style={{
        width: '100%', padding: '12px 0', borderRadius: 12,
        background: 'var(--accent)', border: 'none', color: '#fff',
        fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
        cursor: (!hasChanges || isBusy) ? 'not-allowed' : 'pointer',
        opacity: (!hasChanges || isBusy) ? 0.6 : 1, transition: 'opacity 0.2s',
      }}>
        {isBusy ? 'Testing connection…' : 'Test & Save'}
      </button>
    </form>
  );
}

// "Set up another device": a link carrying this device's saved station, key
// and expiry, sent by the share sheet (AirDrop, Messages) or copied. See
// deviceSetup.js. Settings shows it only once a station and key are saved.
export function DeviceLinkForm({ stationId, dashboard = false }) {
  const [linkStatus, setLinkStatus] = useState(null); // null | 'shared' | 'copied' | link text to copy by hand
  const [linkDashboard, setLinkDashboard] = useState(dashboard);
  const storedKey = readStored(STORAGE_KEYS.TWC_API_KEY, '');
  const storedExpiry = readStored(STORAGE_KEYS.TWC_KEY_EXPIRES, '');

  const handleDeviceLink = async () => {
    const link = buildDeviceLink(linkOrigin(window.location), {
      stationId, key: storedKey, expires: storedExpiry || null, dashboard: linkDashboard,
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'YardObs setup link', url: link });
        setLinkStatus('shared');
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return; // closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(link);
      setLinkStatus('copied');
    } catch {
      setLinkStatus(link); // no share sheet or clipboard: show it to copy by hand
    }
  };

  if (!storedKey || !stationId) return null;
  return (
    <div>
      <button type="button" onClick={handleDeviceLink} style={{
        width: '100%', padding: '10px 0', borderRadius: 12,
        background: 'var(--soft)', border: '1px solid var(--border)', color: 'var(--accent)',
        fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer',
      }}>
        {linkStatus === 'copied' ? 'Link copied ✓' : linkStatus === 'shared' ? 'Link sent ✓' : 'Send setup link'}
      </button>
      <label style={{ display: 'flex', alignItems: 'center', marginTop: 8, fontSize: 12, color: 'var(--ts)', cursor: 'pointer' }}>
        <input type="checkbox" checked={linkDashboard}
          onChange={e => { setLinkDashboard(e.target.checked); setLinkStatus(null); }}
          style={{ marginRight: 8 }} />
        Open as a dashboard on that device
      </label>
      {linkStatus && linkStatus !== 'copied' && linkStatus !== 'shared' && (
        <input readOnly value={linkStatus} onFocus={e => e.target.select()}
          style={{
            width: '100%', marginTop: 8, padding: '10px 12px', boxSizing: 'border-box',
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
            fontSize: 11, color: 'var(--tp)', fontFamily: 'var(--font-mono)', outline: 'none',
          }} />
      )}
      <div style={{ fontSize: 11, color: 'var(--tm)', marginTop: 6, lineHeight: 1.5 }}>
        Open the link in Safari on your iPad or other device; add it to the Home Screen from there.
        The key in the link is scrambled, not locked, so only send it to your own devices.
      </div>
    </div>
  );
}
