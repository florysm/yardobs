import { Component } from 'react';
import { reportError } from '../utils/reportError';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
    reportError(error, { where: this.props.where ?? this.props.label ?? 'error boundary', componentStack: info?.componentStack ?? '' });
  }

  render() {
    if (this.state.error) {
      // `fallback` replaces the message entirely (null: render nothing).
      if ('fallback' in this.props) return this.props.fallback;
      const { label = 'Something went wrong loading this tab.', reload = false, actions = null } = this.props;
      // `actions`: buttons offered instead of "Try again", e.g. a way out of a
      // layout that keeps failing ({ label, onClick }[]).
      if (actions?.length) {
        return (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--tm)', fontSize: 14 }}>
            <div style={{ marginBottom: 16, color: 'var(--tp)', fontWeight: 600 }}>{label}</div>
            {actions.map((a, i) => (
              <button key={a.label} onClick={a.onClick} style={{
                margin: '0 6px 8px', padding: '10px 18px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                fontFamily: 'var(--font-body)', cursor: 'pointer',
                border: i === 0 ? 'none' : '1px solid var(--border)',
                background: i === 0 ? 'var(--accent)' : 'var(--soft)',
                color: i === 0 ? '#fff' : 'var(--tp)',
              }}>
                {a.label}
              </button>
            ))}
          </div>
        );
      }
      return (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>{label}</div>
          <button
            onClick={() => (reload ? window.location.reload() : this.setState({ error: null }))}
            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {reload ? 'Reload' : 'Try again'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
