import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      const { label = 'Something went wrong loading this tab.', reload = false } = this.props;
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
