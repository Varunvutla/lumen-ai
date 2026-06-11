import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  ShieldCheck,
  UserCircle,
  X,
  Eye,
  EyeOff,
  User,
  Camera,
  CheckCircle2,
  AlertCircle,
  Chrome,
} from "lucide-react";
import { forgotPassword, loginUser, registerUser, resetPassword, updateMe, verifyOtp, googleAuth } from "../../api.js";
import GoogleSignInButton from "./GoogleSignInButton.jsx";

const TOKEN_KEY = "lumen.auth.token";

const MODES = {
  LOGIN: "login",
  REGISTER: "register",
  FORGOT: "forgot",
  VERIFY: "verify",
  RESET: "reset",
  PROFILE: "profile",
};

export default function AuthModal({ open, user, onClose, onAuth, onLogout }) {
  const [mode, setMode] = useState(user ? MODES.PROFILE : MODES.LOGIN);
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [resetForm, setResetForm] = useState({ email: "", otp: "", password: "" });
  const [profileName, setProfileName] = useState(user?.name || "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Sync mode when user changes
  const currentMode = user ? MODES.PROFILE : mode;

  function switchMode(m) {
    setMode(m);
    setError("");
    setNotice("");
  }

  async function submitAuth(e) {
    e.preventDefault();
    setAuthLoading(true);
    setError("");
    setNotice("");
    try {
      const action = mode === MODES.REGISTER ? registerUser : loginUser;
      const payload =
        mode === MODES.REGISTER
          ? authForm
          : { email: authForm.email, password: authForm.password };
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
      switchMode(MODES.VERIFY);
      setNotice("Verification code sent to your email.");
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
      switchMode(MODES.RESET);
      setNotice("Code verified! Enter your new password.");
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
      switchMode(MODES.LOGIN);
      setAuthForm((prev) => ({ ...prev, email: resetForm.email, password: "" }));
      setResetForm({ email: "", otp: "", password: "" });
      setNotice("Password updated! Login with your new password.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function saveName() {
    setSavingName(true);
    setError("");
    setNotice("");
    try {
      const updated = await updateMe({ name: profileName });
      onAuth(updated);
      setNotice("Profile updated successfully!");
      setTimeout(() => setNotice(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingName(false);
    }
  }

  async function handleGoogleSuccess(credential) {
    setGoogleLoading(true);
    setError("");
    try {
      const data = await googleAuth(credential);
      localStorage.setItem(TOKEN_KEY, data.token);
      setProfileName(data.user.name || "");
      onAuth(data.user);
    } catch (err) {
      setError(err.message || "Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    onLogout();
    switchMode(MODES.LOGIN);
  }

  if (!open) return null;

  const isAuthMode = [MODES.LOGIN, MODES.REGISTER].includes(currentMode);
  const isResetFlow = [MODES.FORGOT, MODES.VERIFY, MODES.RESET].includes(currentMode);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end modal-overlay backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-auto flex flex-col border-l border-ink-200/80 shadow-lift bg-paper-50"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-paper-50/95 backdrop-blur border-b border-ink-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, rgb(var(--forest-500)), rgb(var(--coral-500)))" }}
            >
              <span className="text-white font-bold text-lg">L</span>
            </div>
            <div className="min-w-0">
              <div className="font-display text-2xl text-ink-800">Profile</div>
              <div className="label truncate">Smart Shopping Reader</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-500 hover:text-ink-800 hover:bg-ink-100 transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 space-y-6">
          <AnimatePresence mode="wait">
            {/* ───── PROFILE (logged in) ───── */}
            {currentMode === MODES.PROFILE && user && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-5"
              >
                {/* Avatar & Identity */}
                <div
                  className="rounded-2xl p-6 text-center relative overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, rgb(var(--forest-500)) 0%, rgb(var(--forest-600)) 50%, rgb(var(--coral-500)) 100%)",
                  }}
                >
                  <div className="relative inline-block">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.name}
                        className="w-20 h-20 rounded-full border-4 border-white shadow-lg mx-auto"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg mx-auto flex items-center justify-center bg-white/20">
                        <span className="text-white text-3xl font-bold">
                          {user.name?.[0]?.toUpperCase() || "U"}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-forest-500 border-2 border-paper-50" />
                  </div>
                  <div className="mt-3 text-white font-bold text-xl">{user.name}</div>
                  <div className="text-white/70 text-sm mt-0.5">{user.email}</div>
                  <div className="mt-2">
                    <span
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium"
                      style={{ background: "rgba(255,255,255,0.2)", color: "white" }}
                    >
                      {user.provider === "google" ? (
                        <>
                          <Chrome className="w-3 h-3" /> Google Account
                        </>
                      ) : (
                        <>
                          <Mail className="w-3 h-3" /> Email Account
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Profile Info Cards */}
                <div className="space-y-3">
                  <InfoCard icon={<Mail className="w-4 h-4" />} label="Email" value={user.email} />
                  <InfoCard icon={<User className="w-4 h-4" />} label="Account ID" value={`#${user.id}`} />
                  <InfoCard
                    icon={<ShieldCheck className="w-4 h-4" />}
                    label="Provider"
                    value={user.provider === "google" ? "Google OAuth" : "Email & Password"}
                    accent
                  />
                </div>

                {/* Edit Name */}
                <div className="rounded-2xl p-5 space-y-3 bg-paper-100 border border-ink-200/60">
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "rgb(var(--ink-700))" }}>
                    <Pencil className="w-4 h-4" /> Edit Display Name
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your name"
                      className="flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-forest-500/40 placeholder:text-ink-400 bg-paper-50 border border-ink-200/60 text-ink-800"
                    />
                    <button
                      onClick={saveName}
                      disabled={savingName || !profileName.trim() || profileName === user.name}
                      className="px-4 py-3 btn-primary"
                    >
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Save
                    </button>
                  </div>
                </div>

                {/* Alerts */}
                {error && <AlertBanner type="error" message={error} />}
                {notice && <AlertBanner type="success" message={notice} />}

                {/* Sign out */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-full text-sm font-medium transition-all"
                  style={{
                    background: "rgb(var(--coral-500) / 0.08)",
                    color: "rgb(var(--coral-600))",
                    border: "1px solid rgb(var(--coral-500) / 0.2)",
                  }}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </motion.div>
            )}

            {/* ───── LOGIN / REGISTER ───── */}
            {isAuthMode && (
              <motion.div
                key="auth"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-5"
              >
                {/* Title */}
                <div>
                  <h2 className="font-bold text-2xl text-ink-800">
                    {mode === MODES.LOGIN ? "Welcome back" : "Create account"}
                  </h2>
                  <p className="text-sm mt-1 text-ink-500">
                    {mode === MODES.LOGIN
                      ? "Sign in to access your AI shopping companion."
                      : "Join LuMen and discover smarter shopping."}
                  </p>
                </div>

                {/* Tab switcher */}
                <div className="flex rounded-full p-1" style={{ background: "rgb(var(--ink-100) / 0.5)" }}>
                  {[MODES.LOGIN, MODES.REGISTER].map((m) => (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className="flex-1 rounded-full px-4 py-2 text-sm font-medium transition-all"
                      style={
                        mode === m
                          ? { background: "rgb(var(--paper-50))", color: "rgb(var(--forest-500))", boxShadow: "var(--shadow-soft)" }
                          : { color: "rgb(var(--ink-400))" }
                      }
                    >
                      {m === MODES.LOGIN ? "Sign In" : "Sign Up"}
                    </button>
                  ))}
                </div>

                {/* Google Button */}
                <GoogleSignInButton onSuccess={handleGoogleSuccess} loading={googleLoading} />

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-ink-200/60" />
                  <span className="text-xs text-ink-400">
                    or continue with email
                  </span>
                  <div className="flex-1 h-px bg-ink-200/60" />
                </div>

                {/* Auth Form */}
                <form onSubmit={submitAuth} className="space-y-4">
                  {mode === MODES.REGISTER && (
                    <InputField
                      label="Full Name"
                      type="text"
                      value={authForm.name}
                      onChange={(v) => setAuthForm({ ...authForm, name: v })}
                      placeholder="John Doe"
                      icon={<User className="w-4 h-4" />}
                    />
                  )}
                  <InputField
                    label="Email Address"
                    type="email"
                    value={authForm.email}
                    onChange={(v) => setAuthForm({ ...authForm, email: v })}
                    placeholder="you@example.com"
                    icon={<Mail className="w-4 h-4" />}
                  />
                  <InputField
                    label="Password"
                    type={showPassword ? "text" : "password"}
                    value={authForm.password}
                    onChange={(v) => setAuthForm({ ...authForm, password: v })}
                    placeholder={mode === MODES.REGISTER ? "Min 8 characters" : "••••••••"}
                    icon={<KeyRound className="w-4 h-4" />}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-ink-400 hover:text-ink-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />

                  {mode === MODES.LOGIN && (
                    <button
                      type="button"
                      onClick={() => {
                        setResetForm((prev) => ({ ...prev, email: authForm.email }));
                        switchMode(MODES.FORGOT);
                      }}
                      className="text-sm font-medium transition-colors hover:text-forest-600"
                      style={{ color: "rgb(var(--forest-500))" }}
                    >
                      Forgot password?
                    </button>
                  )}

                  {error && <AlertBanner type="error" message={error} />}
                  {notice && <AlertBanner type="success" message={notice} />}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full btn-primary py-3"
                  >
                    {authLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {mode === MODES.LOGIN ? "Sign In" : "Create Account"}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ───── FORGOT PASSWORD ───── */}
            {currentMode === MODES.FORGOT && (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="font-bold text-2xl text-ink-800">
                    Reset Password
                  </h2>
                  <p className="text-sm mt-1 text-ink-500">
                    Enter your email and we'll send you a verification code.
                  </p>
                </div>
                <form onSubmit={submitForgot} className="space-y-4">
                  <InputField
                    label="Email Address"
                    type="email"
                    value={resetForm.email}
                    onChange={(v) => setResetForm({ ...resetForm, email: v })}
                    placeholder="you@example.com"
                    icon={<Mail className="w-4 h-4" />}
                  />
                  {error && <AlertBanner type="error" message={error} />}
                  {notice && <AlertBanner type="success" message={notice} />}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full btn-primary py-3"
                  >
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Send Verification Code
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode(MODES.LOGIN)}
                    className="w-full py-3 rounded-full text-sm font-medium transition-all hover:bg-ink-100"
                    style={{ color: "rgb(var(--ink-600))", background: "rgb(var(--ink-100) / 0.6)" }}
                  >
                    ← Back to Sign In
                  </button>
                </form>
              </motion.div>
            )}

            {/* ───── VERIFY OTP ───── */}
            {currentMode === MODES.VERIFY && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="font-bold text-2xl text-ink-800">
                    Enter Code
                  </h2>
                  <p className="text-sm mt-1 text-ink-500">
                    Check your email for the 4-digit code.
                  </p>
                </div>
                <form onSubmit={submitVerify} className="space-y-4">
                  <InputField
                    label="Verification Code"
                    type="text"
                    value={resetForm.otp}
                    onChange={(v) => setResetForm({ ...resetForm, otp: v.replace(/\D/g, "").slice(0, 4) })}
                    placeholder="0000"
                    icon={<ShieldCheck className="w-4 h-4" />}
                    inputMode="numeric"
                    maxLength={4}
                  />
                  {error && <AlertBanner type="error" message={error} />}
                  {notice && <AlertBanner type="success" message={notice} />}
                  <button
                    type="submit"
                    disabled={authLoading || resetForm.otp.length < 4}
                    className="w-full btn-primary py-3"
                  >
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Verify Code
                  </button>
                </form>
              </motion.div>
            )}

            {/* ───── RESET PASSWORD ───── */}
            {currentMode === MODES.RESET && (
              <motion.div
                key="reset"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="font-bold text-2xl text-ink-800">
                    New Password
                  </h2>
                  <p className="text-sm mt-1 text-ink-500">
                    Choose a strong password for your account.
                  </p>
                </div>
                <form onSubmit={submitReset} className="space-y-4">
                  <InputField
                    label="New Password"
                    type={showPassword ? "text" : "password"}
                    value={resetForm.password}
                    onChange={(v) => setResetForm({ ...resetForm, password: v })}
                    placeholder="Min 8 characters"
                    icon={<KeyRound className="w-4 h-4" />}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-ink-400 hover:text-ink-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />
                  {error && <AlertBanner type="error" message={error} />}
                  {notice && <AlertBanner type="success" message={notice} />}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full btn-primary py-3"
                  >
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    Update Password
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </div>
  );
}

// ── Reusable sub-components ──────────────────────────────────────────────────

function InputField({ label, type, value, onChange, placeholder, icon, suffix, inputMode, maxLength }) {
  return (
    <label className="block space-y-1.5 text-left">
      <span className="text-xs font-semibold text-ink-600">{label}</span>
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all focus-within:ring-2 focus-within:ring-forest-500/40"
        style={{
          background: "rgb(var(--paper-50))",
          border: "1.5px solid rgb(var(--ink-200) / 0.6)",
        }}
      >
        <span style={{ color: "rgb(var(--ink-400))" }}>{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-ink-400"
          style={{ color: "rgb(var(--ink-800))" }}
        />
        {suffix}
      </div>
    </label>
  );
}

function InfoCard({ icon, label, value, accent }) {
  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl"
      style={{
        background: accent ? "rgb(var(--forest-500) / 0.06)" : "rgb(var(--ink-100) / 0.6)",
        border: accent ? "1px solid rgb(var(--forest-500) / 0.2)" : "1px solid rgb(var(--ink-200) / 0.4)",
      }}
    >
      <span style={{ color: accent ? "rgb(var(--forest-500))" : "rgb(var(--ink-400))" }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium" style={{ color: "rgb(var(--ink-400))" }}>{label}</div>
        <div className="text-sm font-semibold truncate mt-0.5" style={{ color: "rgb(var(--ink-700))" }}>{value}</div>
      </div>
    </div>
  );
}

function AlertBanner({ type, message }) {
  const isError = type === "error";
  return (
    <div
      className="flex items-start gap-2 p-3 rounded-xl text-sm"
      style={{
        background: isError ? "rgb(var(--coral-500) / 0.08)" : "rgb(var(--forest-500) / 0.08)",
        border: isError ? "1px solid rgb(var(--coral-500) / 0.2)" : "1px solid rgb(var(--forest-500) / 0.2)",
        color: isError ? "rgb(var(--coral-600))" : "rgb(var(--forest-600))",
      }}
    >
      {isError ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
      {message}
    </div>
  );
}
