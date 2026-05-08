export const THEMES = {
  sunny: {
    bg: '#fdf6ec', card: 'rgba(255,255,255,0.72)', cardH: 'rgba(255,255,255,0.92)',
    glass: 'rgba(255,245,225,0.5)', accent: '#e8760a', soft: '#fde8c8',
    glow: 'rgba(232,118,10,0.15)', tp: '#1a1208', ts: '#7a5c34', tm: '#b89060',
    border: 'rgba(232,118,10,0.13)',
    hero: 'linear-gradient(135deg, #ffe8b0 0%, #ffd580 40%, #ffb347 100%)',
    bar: 'linear-gradient(90deg, #f7a844, #e8760a)', yoy: '#c8520a',
    deltaUp: '#22a55a', deltaDn: '#d9382d',
    overlayBg: 'rgba(26,18,8,0.45)', overlayText: 'rgba(253,246,236,0.92)',
    decoRing: 'rgba(26,18,8,0.06)', colorScheme: 'light',
  },
  cloudy: {
    bg: '#eef0f4', card: 'rgba(255,255,255,0.68)', cardH: 'rgba(255,255,255,0.88)',
    glass: 'rgba(220,225,235,0.5)', accent: '#5b7fa6', soft: '#d4e1f0',
    glow: 'rgba(91,127,166,0.15)', tp: '#1a1f2e', ts: '#4a5568', tm: '#8898aa',
    border: 'rgba(91,127,166,0.13)',
    hero: 'linear-gradient(135deg, #cfd8e8 0%, #b8c8dc 50%, #9bafc8 100%)',
    bar: 'linear-gradient(90deg, #7fa0c0, #5b7fa6)', yoy: '#3a5f86',
    deltaUp: '#1e7a46', deltaDn: '#c0392b',
    overlayBg: 'rgba(26,31,46,0.45)', overlayText: 'rgba(238,240,244,0.92)',
    decoRing: 'rgba(26,31,46,0.06)', colorScheme: 'light',
  },
  rainy: {
    bg: '#1a2030', card: 'rgba(30,40,60,0.8)', cardH: 'rgba(40,55,80,0.92)',
    glass: 'rgba(20,30,50,0.6)', accent: '#4fc3f7', soft: 'rgba(79,195,247,0.15)',
    glow: 'rgba(79,195,247,0.18)', tp: '#e8f0fe', ts: '#90a4c0', tm: '#546e8a',
    border: 'rgba(79,195,247,0.13)',
    hero: 'linear-gradient(135deg, #1a2a42 0%, #1e3050 50%, #162238 100%)',
    bar: 'linear-gradient(90deg, #29b6f6, #4fc3f7)', yoy: '#0288d1',
    deltaUp: '#4cde8a', deltaDn: '#ff6b6b',
    overlayBg: 'rgba(0,0,0,0.45)', overlayText: 'rgba(232,240,254,0.90)',
    decoRing: 'rgba(79,195,247,0.08)', colorScheme: 'dark',
  },
  stormy: {
    bg: '#0f1018', card: 'rgba(20,22,35,0.85)', cardH: 'rgba(30,33,50,0.92)',
    glass: 'rgba(15,16,25,0.7)', accent: '#b388ff', soft: 'rgba(179,136,255,0.12)',
    glow: 'rgba(179,136,255,0.18)', tp: '#ede7ff', ts: '#8070a8', tm: '#504060',
    border: 'rgba(179,136,255,0.13)',
    hero: 'linear-gradient(135deg, #1a1428 0%, #0f1018 60%, #1c1030 100%)',
    bar: 'linear-gradient(90deg, #9c27b0, #b388ff)', yoy: '#7b1fa2',
    deltaUp: '#56e09a', deltaDn: '#ff6b6b',
    overlayBg: 'rgba(0,0,0,0.50)', overlayText: 'rgba(237,231,255,0.90)',
    decoRing: 'rgba(179,136,255,0.08)', colorScheme: 'dark',
  },
  light: {
    bg: '#f7f8fa', card: 'rgba(255,255,255,0.9)', cardH: '#fff',
    glass: 'rgba(240,242,245,0.8)', accent: '#1a73e8', soft: '#e8f0fe',
    glow: 'rgba(26,115,232,0.12)', tp: '#1a1a2e', ts: '#4a5568', tm: '#9aa5b4',
    border: 'rgba(26,115,232,0.12)',
    hero: 'linear-gradient(135deg, #e8f0fe 0%, #dce8fb 50%, #c8dbf8 100%)',
    bar: 'linear-gradient(90deg, #4a90e2, #1a73e8)', yoy: '#0d47a1',
    deltaUp: '#1e7a46', deltaDn: '#c0392b',
    overlayBg: 'rgba(26,26,46,0.40)', overlayText: 'rgba(247,248,250,0.92)',
    decoRing: 'rgba(26,26,46,0.05)', colorScheme: 'light',
  },
  dark: {
    bg: '#0e1117', card: '#1a1f2e', cardH: '#222840',
    glass: 'rgba(22,27,46,0.92)', accent: '#64b5f6', soft: 'rgba(100,181,246,0.15)',
    glow: 'rgba(100,181,246,0.25)', tp: '#dce8f5', ts: '#7b8fa8', tm: '#4f6175',
    border: '#2a3248',
    hero: 'linear-gradient(135deg, #1c2240 0%, #0e1117 60%, #161c30 100%)',
    bar: 'linear-gradient(90deg, #42a5f5, #64b5f6)', yoy: '#1565c0',
    deltaUp: '#4cde8a', deltaDn: '#ff6b6b',
    overlayBg: 'rgba(0,0,0,0.45)', overlayText: 'rgba(220,232,245,0.90)',
    decoRing: 'rgba(100,181,246,0.07)', colorScheme: 'dark',
  },
};

export const CHART_COLORS = Object.fromEntries(
  Object.entries(THEMES).map(([id, t]) => [id, { accent: t.accent, yoy: t.yoy }])
);

export const META_COLORS = Object.fromEntries(
  Object.entries(THEMES).map(([id, t]) => [id, t.bg])
);

export const CONDITION_PREVIEWS = [
  { id: 'sunny',  label: 'Sunny',  icon: '☀️', bg: THEMES.sunny.bg,  accent: THEMES.sunny.accent,  text: THEMES.sunny.ts,  hero: THEMES.sunny.hero  },
  { id: 'cloudy', label: 'Cloudy', icon: '☁️', bg: THEMES.cloudy.bg, accent: THEMES.cloudy.accent, text: THEMES.cloudy.ts, hero: THEMES.cloudy.hero },
  { id: 'rainy',  label: 'Rainy',  icon: '🌧️', bg: THEMES.rainy.bg,  accent: THEMES.rainy.accent,  text: THEMES.rainy.ts,  hero: THEMES.rainy.hero  },
  { id: 'stormy', label: 'Stormy', icon: '⛈️', bg: THEMES.stormy.bg, accent: THEMES.stormy.accent, text: THEMES.stormy.ts, hero: THEMES.stormy.hero },
  { id: 'light',  label: 'Light',  icon: '🌤️', bg: THEMES.light.bg,  accent: THEMES.light.accent,  text: THEMES.light.ts,  hero: THEMES.light.hero  },
  { id: 'dark',   label: 'Dark',   icon: '🌑', bg: THEMES.dark.bg,   accent: THEMES.dark.accent,   text: THEMES.dark.ts,   hero: THEMES.dark.hero   },
];
