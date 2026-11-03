import { UNITS } from './units';

// The Scriptable widget template (public/widget/yardobs-widget.js) carries its
// settings in one marked span; the app swaps in the user's own values before
// copying it to the clipboard, so the key never leaves the device.
const CONFIG_SPAN = /\/\*YARDOBS_CONFIG\*\/[\s\S]*?\/\*END\*\//;

export const WIDGET_TEMPLATE_URL = '/widget/yardobs-widget.js';
export const SCRIPTABLE_APP_URL  = 'https://apps.apple.com/app/scriptable/id1405459188';
// The setup steps tell users to name the script this; the update link runs it by name.
export const WIDGET_SCRIPT_NAME  = 'YardObs';
export const WIDGET_UPDATE_URL   = `scriptable:///run/${encodeURIComponent(WIDGET_SCRIPT_NAME)}?update=1`;

// Station mode uses the home station, not an explored location — the widget is
// "my yard", and exploring is a temporary detour. Returns null when the current
// settings can't produce a working widget (station without a key, preview
// without a location). `generatedAt` lets the widget tell a freshly pasted
// script apart from an older one it already holds an update for.
export function widgetConfigFromSettings({ profile, twcKey, keyExpires, units, now = Date.now() }) {
  const u = units === UNITS.METRIC ? UNITS.METRIC : UNITS.IMPERIAL;
  if (profile?.mode === 'station') {
    if (!profile.stationId || !twcKey) return null;
    return { mode: 'station', stationId: profile.stationId, twcKey, keyExpires: keyExpires || null, lat: null, lon: null, label: null, units: u, generatedAt: now };
  }
  if (profile?.lat == null || profile?.lon == null) return null;
  return { mode: 'preview', stationId: null, twcKey: null, keyExpires: null, lat: profile.lat, lon: profile.lon, label: profile.label ?? null, units: u, generatedAt: now };
}

// Clipboard payload read by the widget script when opened via WIDGET_UPDATE_URL.
// Wrapped in a tagged object so the script can ignore unrelated clipboard text.
export function buildWidgetUpdatePayload(config) {
  return JSON.stringify({ yardobsWidgetConfig: config });
}

export function buildWidgetScript(template, config) {
  if (!CONFIG_SPAN.test(template)) throw new Error('Widget template is missing its config marker');
  // Function replacement so `$` sequences in values aren't treated as patterns.
  return template.replace(CONFIG_SPAN, () => `/*YARDOBS_CONFIG*/${JSON.stringify(config)}/*END*/`);
}
