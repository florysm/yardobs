// Severe-weather alert normalization. The rest of the app consumes only the
// normalized shape below, so additional sources (e.g. TWC, if the plan is ever
// upgraded) can be added by writing another `normalize*` branch — the UI never
// needs to know which source an alert came from.
//
// Normalized alert shape:
//   { id, event, severity, headline, description, instruction, onset, expires, source }
//   severity ∈ 'extreme' | 'severe' | 'moderate' | 'minor' | 'unknown'

const SEVERITY_RANK = { extreme: 4, severe: 3, moderate: 2, minor: 1, unknown: 0 };

// Accent color by severity — used by the bar and the sheet.
const SEVERITY_COLORS = {
  extreme:  '#b91c1c', // deep red
  severe:   '#dc2626', // red
  moderate: '#ea580c', // orange
  minor:    '#d97706', // amber
  unknown:  '#6b7280', // gray
};

export function severityColor(severity) {
  return SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.unknown;
}

export function severityRank(severity) {
  return SEVERITY_RANK[severity] ?? 0;
}

// Normalizes an NWS active-alerts GeoJSON payload (api.weather.gov/alerts/active).
function normalizeNwsAlerts(raw) {
  const features = Array.isArray(raw?.features) ? raw.features : [];
  const seen = new Set();
  const out = [];

  for (const f of features) {
    const p = f?.properties;
    if (!p) continue;
    // Skip cancellations and non-actual (test/exercise/draft) messages.
    if (p.messageType === 'Cancel') continue;
    if (p.status && p.status !== 'Actual') continue;

    const event = p.event ?? 'Weather Alert';
    // Collapse the same event across adjacent zones into one entry.
    if (seen.has(event)) continue;
    seen.add(event);

    out.push({
      id: p.id ?? `${event}-${p.onset ?? p.effective ?? ''}`,
      event,
      severity: (p.severity ?? 'unknown').toLowerCase(),
      headline: p.headline ?? event,
      description: p.description ?? '',
      instruction: p.instruction ?? null,
      onset: p.onset ?? p.effective ?? null,
      expires: p.ends ?? p.expires ?? null,
      source: 'nws',
    });
  }

  return out;
}

// Single entry point. Detects the payload shape and returns a normalized,
// severity-sorted (worst first) array. Unknown/empty payloads → [].
export function normalizeAlerts(raw) {
  let alerts = [];
  if (raw?.features) alerts = normalizeNwsAlerts(raw);
  // Future: else if (raw?.alerts) alerts = normalizeTwcAlerts(raw);

  return alerts.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}
