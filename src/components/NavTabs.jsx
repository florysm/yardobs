const TABS = [
  { id: 'now',      label: 'Now' },
  { id: 'trends',   label: 'Trends' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'radar',    label: 'Radar' },
];

export default function NavTabs({ active, onChange }) {
  return (
    <nav role="tablist" aria-label="Main navigation" style={{ display: 'flex', padding: '14px 16px 10px', gap: 6 }}>
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={`y-tab${active === id ? ' active' : ''}`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
