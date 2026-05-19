export default function MetricCard({ icon, label, value, unit, trend }) {
  return (
    <div className="y-metric">
      <div style={{ fontSize: 18, marginBottom: 6 }} aria-hidden="true">{icon}</div>
      <div className="y-label" style={{ marginBottom: 0 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--tp)', marginTop: 2 }}>
        {value}<span style={{ fontSize: 11, color: 'var(--tm)' }}>{unit}</span>
      </div>
      {trend && <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4 }}>{trend}</div>}
    </div>
  );
}
