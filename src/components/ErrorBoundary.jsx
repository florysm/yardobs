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
      return (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>Something went wrong loading this tab.</div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
