import { parseChangelog } from '../utils/parseChangelog';
import changelogRaw from '../../CHANGELOG.md?raw';

const SECTION_COLORS = {
  Added:   'var(--accent)',
  Fixed:   '#f59e0b',
  Changed: 'var(--ts)',
  Removed: '#ef4444',
};

const parsed = parseChangelog(changelogRaw);

export default function ChangelogModal({ onClose }) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
          zIndex: 210,
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxWidth: 420, margin: '0 auto',
        background: 'var(--bg)', borderRadius: '24px 24px 0 0',
        borderTop: '1px solid var(--border)',
        zIndex: 220, padding: '0 20px 40px',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '12px auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--tp)' }}>
              What's New
            </div>
            <div style={{ fontSize: 12, color: 'var(--ts)', marginTop: 2 }}>
              YardObs release history
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--card)', border: 'none', cursor: 'pointer',
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: 'var(--ts)', fontFamily: 'var(--font-body)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Releases */}
        {parsed.map((release, i) => (
          <div key={release.version} style={{ marginBottom: 24 }}>
            {/* Version header */}
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10,
            }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 15,
                color: i === 0 ? 'var(--accent)' : 'var(--tp)',
                fontWeight: 600,
              }}>
                v{release.version}
              </div>
              {i === 0 && (
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.5px',
                  color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                  padding: '2px 7px', borderRadius: 99, textTransform: 'uppercase',
                }}>
                  Latest
                </div>
              )}
              {release.date && (
                <div style={{ fontSize: 11, color: 'var(--ts)', marginLeft: 'auto' }}>
                  {release.date}
                </div>
              )}
            </div>

            {/* Sections */}
            {release.sections.map((section) => (
              <div key={section.heading} style={{ marginBottom: 10 }}>
                {section.heading && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.6px',
                    textTransform: 'uppercase',
                    color: SECTION_COLORS[section.heading] ?? 'var(--ts)',
                    marginBottom: 5,
                  }}>
                    {section.heading}
                  </div>
                )}
                <div style={{
                  background: 'var(--card)', borderRadius: 12,
                  padding: '10px 14px',
                  border: '1px solid var(--border)',
                }}>
                  {section.items.map((item, j) => (
                    <div key={j} style={{
                      display: 'flex', gap: 8,
                      paddingTop: j > 0 ? 7 : 0,
                      marginTop: j > 0 ? 7 : 0,
                      borderTop: j > 0 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ color: 'var(--ts)', fontSize: 12, flexShrink: 0, marginTop: 1 }}>·</div>
                      <div style={{ fontSize: 13, color: 'var(--tp)', lineHeight: 1.45 }}>{item}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Divider between releases */}
            {i < parsed.length - 1 && (
              <div style={{ height: 1, background: 'var(--border)', marginTop: 4 }} />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
