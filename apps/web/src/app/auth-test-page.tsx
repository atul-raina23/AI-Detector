import { useState, type CSSProperties } from 'react';

/**
 * Minimal, functional auth test page — NOT the final design (see
 * docs/11-ui-ux-design-system.md for that). Exists only so Phase 1's
 * signup/login/refresh/logout flow can be exercised from a browser.
 *
 * Styled with explicit inline styles (not Tailwind classes) because the
 * Tailwind v4 reset strips default browser chrome from inputs/buttons —
 * without explicit background/border colors they render invisible against
 * the dark-theme page background.
 */
const API_BASE =
  (import.meta as unknown as { env: { VITE_API_URL?: string } }).env
    .VITE_API_URL ?? 'http://localhost:3000/api';

const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: 400,
  boxSizing: 'border-box',
  padding: '0.5rem 0.75rem',
  margin: '0.25rem 0 0.75rem',
  background: '#1a2230',
  border: '1px solid #33475e',
  borderRadius: 6,
  color: '#e6edf3',
  fontSize: '0.95rem',
};

const buttonStyle: CSSProperties = {
  padding: '0.6rem 1.2rem',
  background: '#2dd4bf',
  border: 'none',
  borderRadius: 6,
  color: '#04211d',
  fontWeight: 600,
  fontSize: '0.95rem',
  cursor: 'pointer',
  marginTop: '0.5rem',
};

const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: '#33475e',
  color: '#7c8b9e',
  cursor: 'not-allowed',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  color: '#9ba8b7',
};

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: { id: string; organizationId: string; email: string; name: string };
}

export function AuthTestPage() {
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [log, setLog] = useState<string>('');

  const [signupForm, setSignupForm] = useState({
    organizationName: 'Acme Inc',
    organizationSlug: 'acme-inc',
    name: 'Ada Lovelace',
    email: 'ada@acme.test',
    password: 'correct-horse-battery',
  });
  const [loginForm, setLoginForm] = useState({
    organizationSlug: 'acme-inc',
    email: 'ada@acme.test',
    password: 'correct-horse-battery',
  });

  async function call(path: string, body: unknown) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setLog(`${path} -> HTTP ${res.status}\n${JSON.stringify(data, null, 2)}`);
    if (res.ok && data?.accessToken) {
      setTokens(data);
    }
    return data;
  }

  return (
    <div
      style={{
        maxWidth: 720,
        margin: '2rem auto',
        padding: '0 1rem',
        fontFamily: 'sans-serif',
        color: '#e6edf3',
      }}
    >
      <h1>EngineeringOS — Auth Test Page</h1>
      <p style={{ color: '#9ba8b7' }}>
        Minimal test harness for Phase 1 auth (signup / login / refresh / logout).
        API: <code>{API_BASE}</code>
      </p>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Signup</h2>
        {Object.entries(signupForm).map(([key, value]) => (
          <label key={key} style={labelStyle}>
            {key}
            <input
              style={inputStyle}
              value={value}
              onChange={(e) =>
                setSignupForm((f) => ({ ...f, [key]: e.target.value }))
              }
            />
          </label>
        ))}
        <button style={buttonStyle} onClick={() => call('/v1/auth/signup', signupForm)}>
          Sign up
        </button>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Login</h2>
        {Object.entries(loginForm).map(([key, value]) => (
          <label key={key} style={labelStyle}>
            {key}
            <input
              style={inputStyle}
              value={value}
              onChange={(e) =>
                setLoginForm((f) => ({ ...f, [key]: e.target.value }))
              }
            />
          </label>
        ))}
        <button style={buttonStyle} onClick={() => call('/v1/auth/login', loginForm)}>
          Log in
        </button>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Session</h2>
        <button
          style={tokens ? buttonStyle : disabledButtonStyle}
          disabled={!tokens}
          onClick={() =>
            tokens && call('/v1/auth/refresh', { refreshToken: tokens.refreshToken })
          }
        >
          Refresh token
        </button>{' '}
        <button
          style={tokens ? buttonStyle : disabledButtonStyle}
          disabled={!tokens}
          onClick={async () => {
            if (!tokens) return;
            await call('/v1/auth/logout', { refreshToken: tokens.refreshToken });
            setTokens(null);
          }}
        >
          Logout
        </button>
        {tokens && (
          <p>
            Logged in as <strong>{tokens.user.email}</strong> (org{' '}
            {tokens.user.organizationId})
          </p>
        )}
      </section>

      <section>
        <h2>Last response</h2>
        <pre
          style={{
            background: '#0b0f14',
            color: '#4ade80',
            padding: '1rem',
            borderRadius: 6,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: '0.85rem',
            border: '1px solid #222e3d',
          }}
        >
          {log || '(nothing yet)'}
        </pre>
      </section>
    </div>
  );
}

export default AuthTestPage;
