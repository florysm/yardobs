import { useState } from 'react';
import { STORAGE_KEYS } from '../utils/storageKeys';

export default function StationForm({ initialStationId, onSave }) {
  const [stationId, setStationId] = useState(initialStationId ?? '');
  const [twcApiKey, setTwcApiKey] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | testing | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const storedKey = (() => { try { return localStorage.getItem(STORAGE_KEYS.TWC_API_KEY) || ''; } catch { return ''; } })();
  const hasKey = storedKey.length > 0;
  const hasChanges = stationId.trim() !== (initialStationId ?? '') || twcApiKey.trim() !== '';

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
      const res = await fetch(`/api/weather?type=current&stationId=${encodeURIComponent(sid)}`, {
        headers: key ? { 'x-twc-key': key } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error ?? `Connection failed (${res.status})`);
        setSaveStatus('error');
        return;
      }
      // Save credentials only after a successful test
      try { if (twcApiKey.trim()) localStorage.setItem(STORAGE_KEYS.TWC_API_KEY, twcApiKey.trim()); } catch {}
      onSave(sid);
      setSaveStatus('success');
      setTwcApiKey('');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } catch {
      setErrorMsg('Could not reach the server — check your connection.');
      setSaveStatus('error');
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
  const hintStyle = { fontSize: 11, color: 'var(--tm)', marginTop: 5, lineHeight: 1.5 };

  const isBusy = saveStatus === 'testing';

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Station ID</label>
        <input style={inputStyle} placeholder="e.g. KFLMIAMI123"
          value={stationId} onChange={e => { setStationId(e.target.value); setSaveStatus('idle'); }} required />
        <div style={hintStyle}>Your Weather Underground PWS station ID</div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>
          TWC API Key{hasKey ? ' (leave blank to keep existing)' : ''}
        </label>
        <input style={inputStyle} type="password"
          placeholder={hasKey ? '••••••••  (unchanged)' : 'Your Weather Company API key'}
          value={twcApiKey} onChange={e => { setTwcApiKey(e.target.value); setSaveStatus('idle'); }} autoComplete="off" />
        <div style={hintStyle}>
          Get your TWC API key at{' '}
          <a href="https://www.wunderground.com/member/api-keys" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            wunderground.com/member/api-keys
          </a>
          {' '}(Weather Underground account required). Stored on this device only.
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
