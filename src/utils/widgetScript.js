import { UNITS } from './units';

// The Scriptable widget template (public/widget/yardobs-widget.js) carries its
// settings in one marked span; the app swaps in the user's own values before
// copying it to the clipboard, so the key never leaves the device.
const CONFIG_SPAN = /\/\*YARDOBS_CONFIG\*\/[\s\S]*?\/\*END\*\//;

export const WIDGET_TEMPLATE_URL = '/widget/yardobs-widget.js';
export const SCRIPTABLE_APP_URL  = 'https://apps.apple.com/app/scriptable/id1405459188';

// Station mode uses the home station, not an explored location — the widget is
// "my yard", and exploring is a temporary detour. Returns null when the current
// settings can't produce a working widget (station without a key, preview
// without a location).
export function widgetConfigFromSettings({ profile, twcKey, units }) {
  const u = units === UNITS.METRIC ? UNITS.METRIC : UNITS.IMPERIAL;
  if (profile?.mode === 'station') {
    if (!profile.stationId || !twcKey) return null;
    return { mode: 'station', stationId: profile.stationId, twcKey, lat: null, lon: null, label: null, units: u };
  }
  if (profile?.lat == null || profile?.lon == null) return null;
  return { mode: 'preview', stationId: null, twcKey: null, lat: profile.lat, lon: profile.lon, label: profile.label ?? null, units: u };
}

export function buildWidgetScript(template, config) {
  if (!CONFIG_SPAN.test(template)) throw new Error('Widget template is missing its config marker');
  // Function replacement so `$` sequences in values aren't treated as patterns.
  return template.replace(CONFIG_SPAN, () => `/*YARDOBS_CONFIG*/${JSON.stringify(config)}/*END*/`);
}
