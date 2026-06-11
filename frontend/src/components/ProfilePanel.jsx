import { useState } from "react";
import { KeyRound, Loader2, LogOut, Mail, Pencil, ShieldCheck, UserCircle, X } from "lucide-react";

import { forgotPassword, loginUser, registerUser, resetPassword, updateMe, verifyOtp } from "../api.js";

const TOKEN_KEY = "lumen.auth.token";

export default function ProfilePanel({ open, user, onClose, onAuth, onLogout }) {
  const [mode, setMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [resetForm, setResetForm] = useState({ email: "", otp: "", password: "" });
  const [profileName, setProfileName] = useState(user?.name || "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [savingName, setSavingName] = useState(false);

  async function submitAuth(e) {
    e.preventDefault();
    setAuthLoading(true);
    setError("");
    setNotice("");
    try {
      const action = mode === "register" ? registerUser : loginUser;
      const payload = mode === "register" ? authForm : { email: authForm.email, password: authForm.password };
      const data = await action(payload);
      localStorage.setItem(TOKEN_KEY, data.token);
      setProfileName(data.user.name || "");
      onAuth(data.user);
      setAuthForm({ name: "", email: "", password: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitForgot(e) {
    e.preventDefault();
    setAuthLoading(true);
    setError("");
    setNotice("");
    try {
      await forgotPassword(resetForm.email);
      setMode("verify");
      setNotice("Verification code sent if this account exists.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitVerify(e) {
    e.preventDefault();
    setAuthLoading(true);
    setError("");
    setNotice("");
    try {
      await verifyOtp(resetForm.email, resetForm.otp);
      setMode("reset");
      setNotice("Code verified. Enter a new password.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setAuthLoading(true);
    setError("");
    setNotice("");
    try {
      await resetPassword(resetForm.email, resetForm.otp, resetForm.password);
      setMode("login");
      setAuthForm((prev) => ({ ...prev, email: resetForm.email, password: "" }));
      setResetForm({ email: "", otp: "", password: "" });
      setNotice("Password updated. Login with your new password.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function saveName() {
    setSavingName(true);
    setError("");
    try {
      const updated = await updateMe({ name: profileName });
      onAuth(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingName(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 modal-overlay backdrop-blur-[4px] flex justify-end">
      <aside className="h-full w-full max-w-xl bg-paper-50 shadow-lift border-l border-ink-200 overflow-auto">
        <div className="sticky top-0 z-10 bg-paper-50/95 backdrop-blur border-b border-ink-200 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/lumen-logo.svg" alt="LuMen" className="w-10 h-10 rounded-xl border border-ink-200 bg-paper-50 shadow-soft" />
            <div>
              <div className="font-display text-2xl text-ink-800">{user ? "Profile" : "Sign in"}</div>
              <div className="label">LuMen - Smart Shopping Reader</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {!user ? (
            <section className="card p-5 shadow-soft">
              <div className="flex items-center gap-3 mb-5">
                <UserCircle className="w-5 h-5 text-forest-600" />
                <div>
                  <div className="font-display text-2xl text-ink-800">{mode === "forgot" || mode === "verify" || mode === "reset" ? "Reset password" : "Account access"}</div>
                  <div className="text-sm text-ink-500">Login is required before using LuMen features.</div>
                </div>
              </div>

              {["login", "register"].includes(mode) && <div className="flex rounded-full bg-ink-100 p-1 mb-5">
                {["login", "register"].map((value) => (
                  <button
                    key={value}
                    onClick={() => setMode(value)}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
                      mode === value ? "bg-paper-50 text-ink-800 shadow-soft" : "text-ink-500"
                    }`}
                  >
                    {value === "login" ? "Login" : "Signup"}
                  </button>
                ))}
              </div>}

              {["login", "register"].includes(mode) && <form onSubmit={submitAuth} className="space-y-4">
                {mode === "register" && (
                  <label className="block">
                    <span className="label">Name</span>
                    <input value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} className="mt-2 w-full rounded-xl border border-ink-200 bg-paper-50 px-4 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100" />
                  </label>
                )}
                <label className="block">
                  <span className="label">Email</span>
                  <input type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} className="mt-2 w-full rounded-xl border border-ink-200 bg-paper-50 px-4 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100" />
                </label>
                <label className="block">
                  <span className="label">Password</span>
                  <input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} className="mt-2 w-full rounded-xl border border-ink-200 bg-paper-50 px-4 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100" />
                </label>
                {mode === "login" && (
                  <button type="button" onClick={() => {
                    setResetForm((prev) => ({ ...prev, email: authForm.email }));
                    setMode("forgot");
                    setError("");
                    setNotice("");
                  }} className="inline-flex items-center gap-2 text-sm text-forest-700 hover:text-forest-900">
                    <KeyRound className="w-4 h-4" />
                    Forgot password
                  </button>
                )}
                {error && <div className="rounded-xl border border-coral-400/50 bg-coral-400/10 p-3 text-sm">{error}</div>}
                {notice && <div className="rounded-xl border border-forest-200 bg-forest-100 p-3 text-sm text-forest-800">{notice}</div>}
                <button className="btn-primary w-full" disabled={authLoading}>
                  {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mode === "login" ? "Login" : "Create account"}
                </button>
              </form>}

              {mode === "forgot" && <form onSubmit={submitForgot} className="space-y-4">
                <label className="block">
                  <span className="label">Email</span>
                  <input type="email" value={resetForm.email} onChange={(e) => setResetForm({ ...resetForm, email: e.target.value })} className="mt-2 w-full rounded-xl border border-ink-200 bg-paper-50 px-4 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100" />
                </label>
                {error && <div className="rounded-xl border border-coral-400/50 bg-coral-400/10 p-3 text-sm">{error}</div>}
                {notice && <div className="rounded-xl border border-forest-200 bg-forest-100 p-3 text-sm text-forest-800">{notice}</div>}
                <button className="btn-primary w-full" disabled={authLoading}>
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send verification code
                </button>
                <button type="button" onClick={() => setMode("login")} className="btn-ghost w-full">Back to login</button>
              </form>}

              {mode === "verify" && <form onSubmit={submitVerify} className="space-y-4">
                <label className="block">
                  <span className="label">Verification code</span>
                  <input inputMode="numeric" maxLength="4" value={resetForm.otp} onChange={(e) => setResetForm({ ...resetForm, otp: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="mt-2 w-full rounded-xl border border-ink-200 bg-paper-50 px-4 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100" />
                </label>
                {error && <div className="rounded-xl border border-coral-400/50 bg-coral-400/10 p-3 text-sm">{error}</div>}
                {notice && <div className="rounded-xl border border-forest-200 bg-forest-100 p-3 text-sm text-forest-800">{notice}</div>}
                <button className="btn-primary w-full" disabled={authLoading}>
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Verify code
                </button>
              </form>}

              {mode === "reset" && <form onSubmit={submitReset} className="space-y-4">
                <label className="block">
                  <span className="label">New password</span>
                  <input type="password" value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} className="mt-2 w-full rounded-xl border border-ink-200 bg-paper-50 px-4 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100" />
                </label>
                {error && <div className="rounded-xl border border-coral-400/50 bg-coral-400/10 p-3 text-sm">{error}</div>}
                {notice && <div className="rounded-xl border border-forest-200 bg-forest-100 p-3 text-sm text-forest-800">{notice}</div>}
                <button className="btn-primary w-full" disabled={authLoading}>
                  {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Update password
                </button>
              </form>}
            </section>
          ) : (
            <section className="card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="label">Signed in</div>
                  <div className="mt-1 flex items-center gap-2 text-ink-700">
                    <Mail className="w-4 h-4 text-coral-500" />
                    <span className="text-sm">{user.email}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    localStorage.removeItem(TOKEN_KEY);
                    onLogout();
                  }}
                  className="btn-ghost"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
              <div className="mt-5 flex gap-2">
                <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="flex-1 rounded-xl border border-ink-200 bg-paper-50 px-4 py-3 text-sm outline-none focus:border-forest-400 focus:ring-4 focus:ring-forest-100" />
                <button onClick={saveName} disabled={savingName} className="btn-primary">
                  {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                  Save
                </button>
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
