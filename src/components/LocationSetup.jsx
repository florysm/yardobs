import { useState, useEffect, useRef } from 'react';
import { reverseGeocode, forwardGeocode } from '../utils/geocode';

export default function LocationSetup({ onResolved }) {
  const [stage, setStage]     = useState('locating'); // locating | denied | resolving | error
  const [input, setInput]     = useState('');
  const [geoError, setGeoError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setStage('denied');
      return;
    }
    const timer = setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          const label = await reverseGeocode(lat, lon);
          onResolved(lat, lon, label);
        },
        () => {
          setStage('denied');
          setTimeout(() => inputRef.current?.focus(), 100);
        },
        { timeout: 10000 }
      );
    }, 500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setIsSearching(true);
    setGeoError('');
    try {
      const { lat, lon, label } = await forwardGeocode(input.trim());
      onResolved(lat, lon, label);
    } catch (err) {
      setGeoError(err.message);
      setIsSearching(false);
    }
  };

  const containerStyle = {
    maxWidth: 420,
    margin: '0 auto',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 28px',
  };

  const logoStyle = {
    fontFamily: 'var(--font-display)',
    fontSize: 32,
    fontWeight: 600,
    letterSpacing: '-0.5px',
    color: 'var(--tp)',
    marginBottom: 8,
    lineHeight: 1,
  };

  const taglineStyle = {
    fontSize: 13,
    color: 'var(--ts)',
    marginBottom: 48,
    textAlign: 'center',
    lineHeight: 1.5,
  };

  const cardStyle = {
    width: '100%',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '28px 24px',
    textAlign: 'center',
  };

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    fontSize: 14,
    color: 'var(--tp)',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: 10,
  };

  const btnStyle = {
    width: '100%',
    padding: '12px 0',
    borderRadius: 12,
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: isSearching ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-body)',
    opacity: isSearching ? 0.6 : 1,
  };

  return (
    <div style={containerStyle}>
      <div style={logoStyle}>
        Yard<span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>Obs</span>
      </div>
      <div style={taglineStyle}>
        Hyperlocal weather for your backyard
      </div>

      <div style={cardStyle}>
        {stage === 'locating' && (
          <>
            <div style={{ fontSize: 32, marginBottom: 14 }}>📍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tp)', marginBottom: 6 }}>
              Finding your location…
            </div>
            <div style={{ fontSize: 12, color: 'var(--ts)', lineHeight: 1.5 }}>
              Allow location access to load a preview of your local weather.
            </div>
          </>
        )}

        {stage === 'denied' && (
          <form onSubmit={handleSearch}>
            <div style={{ fontSize: 32, marginBottom: 14 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tp)', marginBottom: 6 }}>
              Enter your location to get started
            </div>
            <div style={{ fontSize: 12, color: 'var(--ts)', marginBottom: 20, lineHeight: 1.5 }}>
              Enter a city name or ZIP code to preview your local weather.
            </div>
            <input
              ref={inputRef}
              style={inputStyle}
              placeholder="e.g. Columbus, OH or 43215"
              value={input}
              onChange={e => setInput(e.target.value)}
              autoComplete="off"
              disabled={isSearching}
            />
            {geoError && (
              <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 10, textAlign: 'left' }}>
                {geoError}
              </div>
            )}
            <button type="submit" style={btnStyle} disabled={isSearching}>
              {isSearching ? 'Looking up…' : 'Show My Weather'}
            </button>
          </form>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--ts)', marginTop: 28, textAlign: 'center', lineHeight: 1.6, opacity: 0.7 }}>
        Preview uses Open-Meteo forecast data.{' '}
        Connect a personal weather station for hyperlocal accuracy.
      </div>
    </div>
  );
}
