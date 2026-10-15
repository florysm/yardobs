import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { buildRadarFrames, hasRadarCoverage, RADAR_RANGES, DEFAULT_RADAR_RANGE } from '../utils/radarFrames.js';
import { STORAGE_KEYS } from '../utils/storageKeys.js';

// Stadia authorizes localhost without a key, so the key is optional in dev.
const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY;
const BASEMAP_TILES = 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png'
  + (STADIA_KEY ? `?api_key=${encodeURIComponent(STADIA_KEY)}` : '');
const RADAR_OPACITY = 0.8;
const FRAME_INTERVAL_MS = 600;
const LAST_FRAME_HOLD_MS = 1500; // pause on most-recent frame before looping
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // IEM tiles are cached for 5 minutes

// Approximates the NWS reflectivity ramp used by the IEM tiles (dBZ, light → extreme).
const LEGEND = [
  { color: '#3fb8c7', label: 'Light' },
  { color: '#2ea84f', label: 'Moderate' },
  { color: '#f2d33b', label: 'Heavy' },
  { color: '#f08a24', label: 'Very Heavy' },
  { color: '#e0301e', label: 'Extreme' },
];

// Preloads every frame as an invisible tile layer on mount so tiles enter the
// browser cache before animation starts. Frame transitions swap opacity instead
// of creating/destroying layers, which eliminates the blank flash between frames.
function RadarLayer({ frames, frameIndex }) {
  const map        = useMap();
  const cacheRef   = useRef({});  // index → L.TileLayer
  const loadedRef  = useRef({});  // index → bool
  const activeRef  = useRef(null);
  const pendingRef = useRef(null); // { layer, handler } — cancelled on frame change

  useEffect(() => {
    if (!frames.length) return;
    frames.forEach((frame, i) => {
      if (cacheRef.current[i]) return;
      const layer = L.tileLayer(frame.url, {
        tileSize: 256,
        opacity: 0.001,
        maxNativeZoom: 8,
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
      pendingRef.current = null;
    };
  // cacheRef/loadedRef/activeRef/pendingRef are stable refs — no dep needed
  }, [frames, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel any stale load listener before showing the new frame. Without this,
  // a slow-loading earlier frame can flash briefly after we've already advanced.
  useEffect(() => {
    if (pendingRef.current) {
      pendingRef.current.layer.off('load', pendingRef.current.handler);
      pendingRef.current = null;
    }

    const layer = cacheRef.current[frameIndex];
    if (!layer) return;
    const show = () => {
      pendingRef.current = null;
      if (activeRef.current && activeRef.current !== layer) {
        activeRef.current.setOpacity(0.001);
      }
      layer.setOpacity(RADAR_OPACITY);
      activeRef.current = layer;
    };
    if (loadedRef.current[frameIndex]) {
      show();
    } else {
      pendingRef.current = { layer, handler: show };
      layer.once('load', show);
    }
  // cacheRef/loadedRef/activeRef/pendingRef are stable refs — no dep needed
  }, [frameIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function formatTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function readStoredRange() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.RADAR_RANGE);
    return v in RADAR_RANGES ? v : DEFAULT_RADAR_RANGE;
  } catch { return DEFAULT_RADAR_RANGE; }
}

export default function RadarTab({ lat, lon, isLoading }) {
  const [range, setRange]           = useState(readStoredRange);
  const [plan, setPlan]             = useState(() => buildRadarFrames(Date.now(), range));
  const [frameIndex, setFrameIndex] = useState(() => plan.pastCount - 1); // most recent observed frame
  const [playing, setPlaying]       = useState(false);
  const timerRef = useRef(null);
  const { frames, pastCount } = plan;
  const covered = lat != null && lon != null && hasRadarCoverage(lat, lon);

  // Frames are computed from the clock, so refreshing is just rebuilding the
  // plan; the radar layer then preloads the new tiles.
  useEffect(() => {
    if (!covered) return;
    const id = setInterval(() => {
      const next = buildRadarFrames(Date.now(), range);
      setPlan(next);
      setFrameIndex(next.pastCount - 1);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [covered, range]);

  const selectRange = (key) => {
    if (key === range) return;
    const next = buildRadarFrames(Date.now(), key);
    setPlaying(false);
    setRange(key);
    setPlan(next);
    setFrameIndex(next.pastCount - 1);
    try { localStorage.setItem(STORAGE_KEYS.RADAR_RANGE, key); } catch { /* storage unavailable */ }
  };

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const advance = () => {
      let next;
      setFrameIndex(i => {
        next = (i + 1) % frames.length;
        return next;
      });
      // Schedule outside the updater — updaters run twice in Strict Mode,
      // which would create two timers per tick and cause runaway speedup.
      timerRef.current = setTimeout(advance, next === 0 ? LAST_FRAME_HOLD_MS : FRAME_INTERVAL_MS);
    };
    timerRef.current = setTimeout(advance, FRAME_INTERVAL_MS);
    return () => {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, frames.length]);

  const prevFrame = () => {
    setPlaying(false);
    setFrameIndex(i => (i - 1 + frames.length) % frames.length);
  };
  const nextFrame = () => {
    setPlaying(false);
    setFrameIndex(i => (i + 1) % frames.length);
  };

  if (lat == null || lon == null || !covered) {
    const hasLocation = lat != null && lon != null;
    return (
      <div className="y-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div style={{ fontSize: 13, color: 'var(--tm)' }}>Radar unavailable</div>
        <div style={{ fontSize: 11, color: 'var(--tm)', opacity: 0.6, marginTop: 4 }}>
          {hasLocation
            ? 'Radar currently covers the United States only'
            : isLoading ? 'Waiting for station location…' : 'Station location not available'}
        </div>
      </div>
    );
  }

  const currentFrame = frames[frameIndex];
  const isProjected  = frames.length > 0 && frameIndex >= pastCount;
  const nowcastCount = frames.length - pastCount;

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
          overflow: 'hidden',
          borderRadius: 12,
          isolation: 'isolate',
        }}
      >
        <MapContainer
          center={[lat, lon]}
          zoom={8}
          style={{ height: 320, width: '100%' }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer url={BASEMAP_TILES} />
          <RadarLayer frames={frames} frameIndex={frameIndex} />
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
            {formatTime(currentFrame.time)}
            <span style={{ opacity: 0.5, marginLeft: 6 }}>
              {frameIndex + 1} / {frames.length}
            </span>
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

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--tm)', opacity: 0.7 }}>Forecast</span>
          {Object.keys(RADAR_RANGES).map(key => (
            <button
              key={key}
              className={`y-pill${key === range ? ' active' : ''}`}
              onClick={() => selectRange(key)}
              aria-pressed={key === range}
              style={{ minWidth: 40, fontSize: 11 }}
            >
              {key}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 10, color: 'var(--tm)', opacity: 0.5, textAlign: 'center' }}>
          Radar: NOAA NEXRAD / HRRR via Iowa Environmental Mesonet · Map: © Stadia Maps © OpenMapTiles © OpenStreetMap contributors
        </div>
      </div>
    </div>
  );
}
