import { useState, useEffect } from 'react';
import { reverseGeocode } from '../utils/geocode';
import LocationSearchInput from './LocationSearchInput';

export default function LocationSetup({ onResolved }) {
  const [stage, setStage] = useState('locating'); // locating | denied

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
        () => setStage('denied'),
        { timeout: 10000 }
      );
    }, 500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          <div>
            <div style={{ fontSize: 32, marginBottom: 14 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tp)', marginBottom: 6 }}>
              Enter your location to get started
            </div>
            <div style={{ fontSize: 12, color: 'var(--ts)', marginBottom: 20, lineHeight: 1.5 }}>
              Enter a city name or ZIP code to preview your local weather.
            </div>
            <LocationSearchInput
              autoFocus
              placeholder="e.g. Columbus, OH or 43215"
              onSelect={(lat, lon, label) => onResolved(lat, lon, label)}
              variant="default"
            />
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--ts)', marginTop: 28, textAlign: 'center', lineHeight: 1.6, opacity: 0.7 }}>
        Preview uses Open-Meteo forecast data.{' '}
        Connect a personal weather station for hyperlocal accuracy.
      </div>
    </div>
  );
}
