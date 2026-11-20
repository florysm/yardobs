import { useState } from 'react';

// A one-line Settings row that opens in place: title on the left, a short
// summary on the right. For things set once and rarely changed (station,
// widget setup), so they don't fill the sheet. The row is a real <button>;
// its content is laid out by an inner span because older Safari (iOS 10)
// ignores flex on <button> itself.
export default function Collapsible({ title, summary, attention = false, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="y-collapsible" style={{ marginBottom: 8 }}>
      <button type="button" className="y-collapsible-row" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="y-collapsible-inner">
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', flexShrink: 0, marginRight: 12 }}>{title}</span>
          <span style={{
            flex: 1, minWidth: 0, textAlign: 'right', fontSize: 12, marginRight: 10,
            color: attention ? 'var(--score-marginal)' : 'var(--ts)', fontWeight: attention ? 600 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {summary}
          </span>
          <span aria-hidden="true" style={{ color: 'var(--tm)', fontSize: 12, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && <div style={{ padding: '12px 2px 6px' }}>{children}</div>}
    </div>
  );
}
