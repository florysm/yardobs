export default function TrendsLockedPlaceholder({ onOpenSettings }) {
  const featureList = [
    '30+ days of temperature & humidity history',
    'Actual measured rainfall totals',
    'Year-over-year comparisons',
    'Custom date range exploration',
    'Solar radiation tracking',
  ];

  return (
    <div>
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '32px 24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--tp)',
          marginBottom: 6,
        }}>
          Historical Trends
        </div>
        <div style={{ fontSize: 13, color: 'var(--ts)', lineHeight: 1.6, marginBottom: 24 }}>
          Historical trends require data from your personal weather station.
        </div>

        <div style={{
          background: 'var(--soft)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '16px 18px',
          textAlign: 'left',
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ts)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: 12,
          }}>
            With your station, you&apos;ll see:
          </div>
          {featureList.map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 13,
              color: 'var(--tm)',
              lineHeight: 1.5,
              marginBottom: i < featureList.length - 1 ? 8 : 0,
            }}>
              <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>→</span>
              {item}
            </div>
          ))}
        </div>

        <button
          onClick={onOpenSettings}
          style={{
            width: '100%',
            padding: '13px 0',
            borderRadius: 14,
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            boxShadow: '0 4px 14px var(--glow)',
          }}
        >
          Connect Your Station
        </button>
      </div>

      <div style={{
        marginTop: 16,
        padding: '14px 16px',
        background: 'var(--soft)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        fontSize: 12,
        color: 'var(--ts)',
        lineHeight: 1.6,
        textAlign: 'center',
      }}>
        Your city forecast can vary 5–10°F from your actual backyard depending on shade, pavement, and elevation.
        A personal weather station captures what&apos;s really happening at your specific location.
      </div>
    </div>
  );
}
