import { useState } from 'react';

export default function AuthGate({ signIn }) {
  const [email, setEmail]       = useState('');
  const [status, setStatus]     = useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setErrorMsg('');
    const err = await signIn(email.trim());
    if (err) {
      setStatus('error');
      setErrorMsg(err.message ?? 'Failed to send link. Check your email and try again.');
    } else {
      setStatus('sent');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 24px', background: 'var(--bg)',
    }}>
      {/* Logo mark */}
      <div style={{
        width: 64, height: 64, borderRadius: 20,
        background: 'var(--accent)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 28, marginBottom: 24,
        boxShadow: '0 8px 24px var(--glow)',
      }}>
        🌤
      </div>

      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 26,
        color: 'var(--tp)', marginBottom: 8, textAlign: 'center',
      }}>
        YardObs
      </div>

      <div style={{
        fontSize: 13, color: 'var(--ts)', marginBottom: 36,
        textAlign: 'center', lineHeight: 1.6,
      }}>
        Your personal weather station dashboard.
      </div>

      {status === 'sent' ? (
        <div style={{
          background: 'var(--soft)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '24px 20px', textAlign: 'center',
          maxWidth: 340, width: '100%',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
          <div style={{ fontSize: 15, color: 'var(--tp)', fontWeight: 600, marginBottom: 8 }}>
            Check your email
          </div>
          <div style={{ fontSize: 13, color: 'var(--ts)', lineHeight: 1.6 }}>
            We sent a sign-in link to <strong>{email}</strong>. Click it to access your dashboard.
          </div>
          <button
            onClick={() => setStatus('idle')}
            style={{
              marginTop: 20, background: 'transparent', border: 'none',
              color: 'var(--accent)', fontSize: 12, cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: 340, width: '100%' }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '24px 20px',
          }}>
            <div style={{ fontSize: 14, color: 'var(--tp)', fontWeight: 600, marginBottom: 4 }}>
              Sign in
            </div>
            <div style={{ fontSize: 12, color: 'var(--ts)', marginBottom: 20, lineHeight: 1.5 }}>
              Enter your email and we'll send you a magic link.
            </div>

            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              style={{
                width: '100%', padding: '12px 14px',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 10, fontSize: 14, color: 'var(--tp)',
                fontFamily: 'var(--font-body)', outline: 'none',
                boxSizing: 'border-box', marginBottom: 12,
              }}
            />

            {status === 'error' && (
              <div style={{
                fontSize: 12, color: '#dc2626', marginBottom: 12,
                background: '#fef2f2', borderRadius: 8, padding: '8px 12px',
              }}>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending' || !email.trim()}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12,
                background: 'var(--accent)', border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: status === 'sending' ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-body)',
                opacity: status === 'sending' ? 0.7 : 1,
                boxShadow: '0 4px 14px var(--glow)',
                transition: 'opacity 0.2s',
              }}
            >
              {status === 'sending' ? 'Sending…' : 'Send Magic Link'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
