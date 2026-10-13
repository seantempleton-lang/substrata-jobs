import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CloudOff, Database, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { getBootstrap, getSession, login, logout, sendSyncProbe } from "./api";
import { getDailyProbeIdentity, getDeviceIdentity } from "./device";
import { cacheFoundation, clearFoundationCache, getCachedFoundation } from "./offlineStore";

export default function FoundationGate({ children }) {
  const [state, setState] = useState({ status: "loading" });

  const establishSession = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const session = await getSession();
      const bootstrap = await getBootstrap();
      const cached = await getCachedFoundation();
      if (cached?.session?.user?.userId === session.user.userId) {
        for (const assignment of bootstrap.assignments) {
          if (assignment.pointFeedAvailable === false) assignment.points = cached.bootstrap.assignments.find(a => a.assignmentId === assignment.assignmentId)?.points || [];
        }
      }
      await cacheFoundation({ session, bootstrap, cachedAt: new Date().toISOString() });
      try { await sendSyncProbe({ deviceId: getDeviceIdentity(), probeId: getDailyProbeIdentity() }); } catch { /* bootstrap remains usable if probe fails */ }
      setState({ status: "ready", mode: "live", user: session.user, expiresAt: session.expiresAt, assignments: bootstrap.assignments, bootstrap });
    } catch (error) {
      if (error.status === 401) {
        setState({ status: "login" });
        return;
      }
      try {
        const cached = await getCachedFoundation();
        if (cached?.session && new Date(cached.session.expiresAt).getTime() > Date.now()) {
          setState({ status: "ready", mode: "offline", user: cached.session.user, expiresAt: cached.session.expiresAt, assignments: cached.bootstrap.assignments, bootstrap: cached.bootstrap, cachedAt: cached.cachedAt });
          return;
        }
      } catch { /* fall through to unavailable */ }
      setState({ status: "unavailable", message: error.message });
    }
  }, []);

  useEffect(() => { establishSession(); }, [establishSession]);

  async function submitLogin(username, password) {
    setState({ status: "authenticating" });
    try {
      await login(username, password);
      await establishSession();
    } catch (error) {
      setState({ status: "login", error: error.message });
    }
  }

  async function endSession() {
    try { await logout(); } catch { /* local sign-out still clears cached operational data */ }
    await clearFoundationCache();
    setState({ status: "login" });
  }

  if (state.status === "loading" || state.status === "authenticating") return <LoadingScreen authenticating={state.status === "authenticating"} />;
  if (state.status === "login") return <LoginScreen submit={submitLogin} error={state.error} />;
  if (state.status === "unavailable") return <UnavailableScreen retry={establishSession} message={state.message} />;

  return children({ ...state, logout: endSession, reauthenticate: () => setState({ status: "login" }) });
}

function Brand() {
  return <div className="foundation-brand"><img src="/favicon.svg" alt="" /><div><span>SUBSTRATA</span><strong>Jobs</strong></div></div>;
}

function LoadingScreen({ authenticating }) {
  return <main className="foundation-page"><section className="foundation-card centered"><Brand /><LoaderCircle className="foundation-spinner" size={30} /><h1>{authenticating ? "Signing you in" : "Preparing field workspace"}</h1><p>Checking your secure session and locally available work.</p></section></main>;
}

function LoginScreen({ submit, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="foundation-page">
      <section className="foundation-card login-card">
        <Brand />
        <div className="login-heading"><span className="foundation-eyebrow">FIELD OPERATIONS</span><h1>Start your shift securely.</h1><p>Use the same username and password as Substrata Ops Manager.</p></div>
        <form onSubmit={(event) => { event.preventDefault(); submit(username, password); }}>
          <label>Username or email<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <div className="login-error" role="alert"><AlertTriangle size={17} />{error}</div>}
          <button className="primary-button" type="submit"><LockKeyhole size={18} />Sign in<ArrowRight size={18} /></button>
        </form>
        <div className="foundation-security"><Database size={17} /><span>Your account remains managed by Ops Manager. No password is stored on this device.</span></div>
      </section>
    </main>
  );
}

function UnavailableScreen({ retry, message }) {
  return <main className="foundation-page"><section className="foundation-card centered"><Brand /><div className="unavailable-icon"><CloudOff size={26} /></div><h1>Workspace unavailable</h1><p>{message || "Connect to the Substrata network, then try again."}</p><button className="secondary-button" onClick={retry}><RefreshCw size={18} />Try again</button></section></main>;
}
