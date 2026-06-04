import { useState, useEffect } from 'react';
import { parseChangelog } from '../utils/parseChangelog';
import changelogRaw from '../../CHANGELOG.md?raw';

const SECTION_COLORS = {
  Added:   'var(--accent)',
  Fixed:   '#f59e0b',
  Changed: 'var(--ts)',
  Removed: '#ef4444',
};

const parsed = parseChangelog(changelogRaw);

function buildBugReportUrl(description, stationId, isPreview, hasScreenshot) {
  const stationCtx = isPreview
    ? 'Preview Mode'
    : stationId
      ? `Station: ${stationId}`
      : 'No station configured';
  const parts = [
    `**Description**\n${description.trim() || '(not provided)'}`,
    '---',
    `**App version:** ${__APP_VERSION__}`,
    `**Station:** ${stationCtx}`,
    `**Browser/OS:** ${navigator.userAgent.slice(0, 200)}`,
  ];
  if (hasScreenshot) parts.push('**Screenshot:** *(paste or drag below)*');
  const url = new URL('https://github.com/florysm/yardobs/issues/new');
  url.searchParams.set('title', '[Bug] ');
  url.searchParams.set('labels', 'bug');
  url.searchParams.set('body', parts.join('\n\n'));
  return url.toString();
}

export default function ChangelogModal({ onClose, stationId = null, isPreview = false }) {
  const [showBugForm, setShowBugForm] = useState(false);
  const [bugDesc, setBugDesc] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!screenshot) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(screenshot);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

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
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Changelog"
        style={{
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

        {/* Bug report entry */}
        <div style={{ textAlign: 'right', marginTop: -12, marginBottom: 16 }}>
          <button
            onClick={() => setShowBugForm(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--ts)', fontFamily: 'var(--font-body)',
              padding: '6px 0', opacity: 0.7,
              textDecoration: showBugForm ? 'underline' : 'none',
            }}
          >
            Found a bug? Report it →
          </button>
        </div>

        {/* Collapsible bug form */}
        <div style={{
          maxHeight: showBugForm ? 460 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.25s ease',
          marginBottom: showBugForm ? 20 : 0,
        }}>
          <div style={{
            background: 'var(--card)', borderRadius: 14,
            border: '1px solid var(--border)', padding: '14px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--ts)', marginBottom: 10, lineHeight: 1.5 }}>
              Opens GitHub — your description and context will be pre-filled.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[`v${__APP_VERSION__}`, isPreview ? 'Preview Mode' : (stationId ?? 'No station')].map(label => (
                <div key={label} style={{
                  fontSize: 10, color: 'var(--ts)',
                  background: 'var(--soft)', border: '1px solid var(--border)',
                  borderRadius: 99, padding: '2px 8px',
                }}>
                  {label}
                </div>
              ))}
            </div>
            <textarea
              value={bugDesc}
              onChange={e => setBugDesc(e.target.value)}
              placeholder="What went wrong? What did you expect?"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 10, fontSize: 13, color: 'var(--tp)',
                fontFamily: 'var(--font-body)', resize: 'none', outline: 'none',
                boxSizing: 'border-box', lineHeight: 1.5,
              }}
            />
            {/* Screenshot picker */}
            <div style={{ marginTop: 10 }}>
              <input
                id="bug-screenshot"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => setScreenshot(e.target.files[0] ?? null)}
              />
              {!screenshot ? (
                <label htmlFor="bug-screenshot" style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                  border: '1px dashed var(--border)', color: 'var(--ts)',
                  fontSize: 12, fontFamily: 'var(--font-body)',
                }}>
                  <span style={{ fontSize: 16 }}>📎</span> Attach screenshot (optional)
                </label>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={previewUrl} alt="screenshot preview" style={{
                    width: 56, height: 56, objectFit: 'cover', borderRadius: 8,
                    border: '1px solid var(--border)', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--ts)', lineHeight: 1.4, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{screenshot.name}</div>
                    <div style={{ marginTop: 2, opacity: 0.7 }}>Paste or drag into GitHub on the next screen</div>
                  </div>
                  <button onClick={() => setScreenshot(null)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 14, color: 'var(--ts)', padding: 4, flexShrink: 0,
                  }}>✕</button>
                </div>
              )}
            </div>

            <a
              href={buildBugReportUrl(bugDesc, stationId, isPreview, !!screenshot)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', marginTop: 10,
                padding: '11px 0', borderRadius: 12,
                background: bugDesc.trim() ? 'var(--accent)' : 'var(--border)',
                color: bugDesc.trim() ? '#fff' : 'var(--ts)',
                textAlign: 'center', textDecoration: 'none',
                fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
                pointerEvents: bugDesc.trim() ? 'auto' : 'none',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              Open GitHub Issue →
            </a>
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--ts)', opacity: 0.6, textAlign: 'center' }}>
              A free GitHub account is required to submit
            </div>
          </div>
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
