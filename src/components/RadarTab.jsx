import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

const RAINVIEWER_API = 'https://api.rainviewer.com/public/weather-maps.json';
const CARTO_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const RADAR_OPACITY = 0.8;
const FRAME_INTERVAL_MS = 500;

// Representative colors sampled from RainViewer's Universal Blue scheme (color 2)
// at dBZ 5, 12, 22, 42, 55 — hardcoded because these are tile overlay colors, not theme vars.
const LEGEND = [
  { color: '#007e00', label: 'Light' },
  { color: '#1068e0', label: 'Moderate' },
  { color: '#920dac', label: 'Heavy' },
  { color: '#fce514', label: 'Very Heavy' },
  { color: '#fd4d0e', label: 'Extreme' },
];

// Preloads every frame as an invisible tile layer on mount so tiles enter the
// browser cache before animation starts. Frame transitions swap opacity instead
// of creating/destroying layers, which eliminates the blank flash between frames.
function RadarLayer({ host, frames, frameIndex }) {
  const map       = useMap();
  const cacheRef  = useRef({});  // index → L.TileLayer
  const loadedRef = useRef({});  // index → bool (all tiles in viewport fetched)
  const activeRef = useRef(null);

  // Create all layers at invisible opacity so tile fetches start immediately.
  useEffect(() => {
    if (!frames.length || !host) return;
    frames.forEach((frame, i) => {
      if (cacheRef.current[i]) return;
      const url = `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
      const layer = L.tileLayer(url, {
        tileSize: 256,
        opacity: 0.001,
        maxNativeZoom: 7,
        maxZoom: 12,
        zIndex: 10,
      });
      layer.once('load', () => { loadedRef.current[i] = true; });
      layer.addTo(map);
      cacheRef.current[i] = layer;
    });
    return () => {
      Object.values(cacheRef.current).forEach(l => { try { map.removeLayer(l); } catch (_) {} });
      cacheRef.current  = {};
      loadedRef.current = {};
      activeRef.current = null;
    };
  }, [frames, host, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swap opacity to reveal the target frame; wait for its load event if not ready yet.
  useEffect(() => {
    const layer = cacheRef.current[frameIndex];
    if (!layer) return;
    const show = () => {
      if (activeRef.current && activeRef.current !== layer) {
        activeRef.current.setOpacity(0.001);
      }
      layer.setOpacity(RADAR_OPACITY);
      activeRef.current = layer;
    };
    if (loadedRef.current[frameIndex]) {
      show();
    } else {
      layer.once('load', show);
    }
  }, [frameIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function formatTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function RadarTab({ lat, lon, isLoading }) {
  const [frames, setFrames]         = useState([]);
  const [pastCount, setPastCount]   = useState(0);
  const [host, setHost]             = useState('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying]       = useState(false);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(RAINVIEWER_API)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const past     = data?.radar?.past     ?? [];
        const nowcast  = data?.radar?.nowcast  ?? [];
        const all = [...past, ...nowcast];
        if (all.length) {
          setHost(data.host);
          setFrames(all);
          setPastCount(past.length);
          setFrameIndex(past.length - 1); // start on most recent observed frame
        }
      })
      .catch(e => { if (!cancelled) setFetchError(e.message); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    let id;
    const advance = () => {
      setFrameIndex(i => (i + 1) % frames.length);
      id = setTimeout(advance, FRAME_INTERVAL_MS);
    };
    id = setTimeout(advance, FRAME_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [playing, frames.length]);

  const prevFrame = () => {
    setPlaying(false);
    setFrameIndex(i => (i - 1 + frames.length) % frames.length);
  };
  const nextFrame = () => {
    setPlaying(false);
    setFrameIndex(i => (i + 1) % frames.length);
  };

  if (!lat || !lon) {
    return (
      <div className="y-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div style={{ fontSize: 13, color: 'var(--tm)' }}>Radar unavailable</div>
        <div style={{ fontSize: 11, color: 'var(--tm)', opacity: 0.6, marginTop: 4 }}>
          {isLoading ? 'Waiting for station location…' : 'Station location not available'}
        </div>
      </div>
    );
  }

  const currentFrame  = frames[frameIndex];
  const isProjected   = frames.length > 0 && frameIndex >= pastCount;
  const nowcastCount  = frames.length - pastCount;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingTop: 2 }}>
        {LEGEND.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: 'var(--tm)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginLeft: -16,
          marginRight: -16,
          width: 'calc(100% + 32px)',
          overflow: 'hidden',
          borderRadius: 12,
        }}
      >
        <MapContainer
          center={[lat, lon]}
          zoom={7}
          style={{ height: 320, width: '100%' }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer url={CARTO_TILES} />
          {frames.length > 0 && host && (
            <RadarLayer host={host} frames={frames} frameIndex={frameIndex} />
          )}
          <CircleMarker
            center={[lat, lon]}
            radius={6}
            pathOptions={{
              color: '#fff',
              fillColor: 'var(--accent, #f59e0b)',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Tooltip permanent direction="right" offset={[10, 0]}>
              <span style={{ fontSize: 10 }}>Your Station</span>
            </Tooltip>
          </CircleMarker>
        </MapContainer>
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--tm)', fontVariantNumeric: 'tabular-nums' }}>
            {currentFrame
              ? formatTime(currentFrame.time)
              : fetchError ? 'Radar unavailable' : 'Loading radar…'}
            {frames.length > 0 && (
              <span style={{ opacity: 0.5, marginLeft: 6 }}>
                {frameIndex + 1} / {frames.length}
              </span>
            )}
          </div>
          {isProjected && (
            <span className="y-pill" style={{
              fontSize: 9,
              padding: '2px 6px',
              background: 'var(--delta-up)',
              color: '#fff',
              opacity: 0.9,
            }}>
              PROJECTED
            </span>
          )}
          {nowcastCount > 0 && !isProjected && (
            <span style={{ fontSize: 9, color: 'var(--tm)', opacity: 0.5 }}>
              +{nowcastCount} projected
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="y-pill" onClick={prevFrame} disabled={frames.length === 0}
            style={{ minWidth: 36 }}>&#8592;</button>
          <button
            className={`y-pill${playing ? ' active' : ''}`}
            onClick={() => setPlaying(p => !p)}
            disabled={frames.length === 0}
            style={{ minWidth: 64 }}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className="y-pill" onClick={nextFrame} disabled={frames.length === 0}
            style={{ minWidth: 36 }}>&#8594;</button>
        </div>

        <div style={{ fontSize: 10, color: 'var(--tm)', opacity: 0.5, textAlign: 'center' }}>
          Radar: RainViewer · Map: © CartoDB
        </div>
      </div>
    </div>
  );
}
