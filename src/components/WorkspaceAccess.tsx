import { useEffect, useId, useState, type ReactNode } from "react";
import { api, setToken } from "../api";
import { Logo, Spinner } from "./ui";
import "../workspace-access.css";

type Status = { mode: "local" | "private"; authenticated: boolean };
export function WorkspaceAccess({
  children,
  onHome,
}: {
  children: (signOut?: () => void) => ReactNode;
  onHome: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  useEffect(() => {
    let live = true;
    void api<Status>("/auth/status")
      .then((value) => {
        if (live) setStatus(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    const expired = () => {
      setToken("");
      setStatus({ mode: "private", authenticated: false });
    };
    window.addEventListener("canopy:sessionexpired", expired);
    return () => {
      live = false;
      window.removeEventListener("canopy:sessionexpired", expired);
    };
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", "POST", { password });
      setPassword("");
      setStatus({ mode: "private", authenticated: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", "POST");
      setToken("");
      setStatus({ mode: "private", authenticated: false });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (status?.authenticated)
    return children(
      status.mode === "private" ? () => void logout() : undefined,
    );
  return (
    <main className="workspace-access">
      <div className="workspace-access-card">
        <Logo />
        {!status ? (
          <>
            <h1>Opening your workspace</h1>
            {error ? (
              <p role="alert">{error}</p>
            ) : (
              <Spinner label="Checking access…" />
            )}
            <button onClick={() => location.reload()}>Retry connection</button>
          </>
        ) : (
          <form onSubmit={login}>
            <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
            <h1>Welcome back.</h1>
            <p>Sign in to continue with your projects and conversations.</p>
            <label htmlFor={inputId}>Owner password</label>
            <input
              id={inputId}
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              maxLength={1024}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            {error && (
              <p className="danger-text" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
        <button className="workspace-access-home" onClick={onHome}>
          Back to Canopy
        </button>
      </div>
    </main>
  );
}
