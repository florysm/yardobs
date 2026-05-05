const TABS = [
  { id: 'now',      label: 'Now' },
  { id: 'trends',   label: 'Trends' },
  { id: 'forecast', label: 'Forecast' },
];

export default function NavTabs({ active, onChange }) {
  return (
    <div style={{ display: 'flex', padding: '14px 16px 10px', gap: 6 }}>
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`y-tab${active === id ? ' active' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
