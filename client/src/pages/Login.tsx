import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { Sprout, Lock, User, ArrowRight, ShieldCheck, Tractor, ShoppingCart, Users, CheckCircle } from "lucide-react";

export default function Login() {
  const { login, loginWithGoogle, isGoogleAuthAvailable, needsRoleSelection, pendingOAuthUser, completeOAuthRegistration, cancelOAuthRegistration } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"farmer" | "buyer" | "fpo">("farmer");
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  const DEMO_ACCOUNTS = [
    { label: "Farmer", user: "shaik.rabbani", roleColor: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    { label: "Farmer 2", user: "shaik.alfhi", roleColor: "bg-emerald-50 text-emerald-800 border-emerald-200" },
    { label: "FPO Lead", user: "koushik", roleColor: "bg-sky-50 text-sky-800 border-sky-200" },
    { label: "Wholesaler", user: "d.krishna", roleColor: "bg-indigo-50 text-indigo-800 border-indigo-200" },
    { label: "Trader", user: "akshay", roleColor: "bg-indigo-50 text-indigo-800 border-indigo-200" },
    { label: "Admin", user: "hemasri", roleColor: "bg-purple-50 text-purple-800 border-purple-200" },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || t("login.loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || "Failed to initialize Google Sign-In");
      setGoogleLoading(false);
    }
  }

  async function handleCompleteRole() {
    setRoleSubmitting(true);
    try {
      await completeOAuthRegistration(selectedRole);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to finalize account role");
      setRoleSubmitting(false);
    }
  }

  function pickDemo(demoUser: string) {
    setUsername(demoUser);
    setPassword("demo123");
  }

  return (
    <div className="min-h-screen bg-page flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Role Selection Modal after first Google OAuth Login */}
      {needsRoleSelection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="card max-w-md w-full p-6 sm:p-8 bg-white shadow-2xl animate-fade-in">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-200 text-brand-700 flex items-center justify-center mx-auto mb-3">
                <Sprout size={28} />
              </div>
              <h3 className="text-xl font-bold text-stone-900">Welcome to KisanSetu!</h3>
              <p className="text-xs text-stone-500 mt-1">
                Signed in as <span className="font-semibold text-stone-800">{pendingOAuthUser?.email}</span>
              </p>
              <p className="text-sm font-semibold text-brand-700 mt-2">
                How will you use the platform?
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <div
                onClick={() => setSelectedRole("farmer")}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                  selectedRole === "farmer"
                    ? "border-brand-600 bg-brand-50/50"
                    : "border-stone-200 hover:border-brand-200 bg-white"
                }`}
              >
                <div className={`p-2 rounded-lg ${selectedRole === "farmer" ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-600"}`}>
                  <Tractor size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-stone-900">Farmer / Producer (किसान)</div>
                    {selectedRole === "farmer" && <CheckCircle size={16} className="text-brand-600" />}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    Sell produce, compare mandi net realization, and receive buyer bids.
                  </div>
                </div>
              </div>

              <div
                onClick={() => setSelectedRole("buyer")}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                  selectedRole === "buyer"
                    ? "border-brand-600 bg-brand-50/50"
                    : "border-stone-200 hover:border-brand-200 bg-white"
                }`}
              >
                <div className={`p-2 rounded-lg ${selectedRole === "buyer" ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-600"}`}>
                  <ShoppingCart size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-stone-900">Buyer / Trader (खरीदार / व्यापारी)</div>
                    {selectedRole === "buyer" && <CheckCircle size={16} className="text-brand-600" />}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    Browse agricultural lots, place offers, and track delivery transactions.
                  </div>
                </div>
              </div>

              <div
                onClick={() => setSelectedRole("fpo")}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 ${
                  selectedRole === "fpo"
                    ? "border-brand-600 bg-brand-50/50"
                    : "border-stone-200 hover:border-brand-200 bg-white"
                }`}
              >
                <div className={`p-2 rounded-lg ${selectedRole === "fpo" ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-600"}`}>
                  <Users size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-stone-900">FPO Representative (एफपीओ)</div>
                    {selectedRole === "fpo" && <CheckCircle size={16} className="text-brand-600" />}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    Aggregate farmer harvest, negotiate bulk lots, and manage storage holding.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={cancelOAuthRegistration}
                className="btn-secondary flex-1 py-2.5 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteRole}
                disabled={roleSubmitting}
                className="btn-primary flex-1 py-2.5 text-xs font-bold"
              >
                {roleSubmitting ? "Finalizing Profile..." : "Confirm & Enter KisanSetu"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-50 border border-brand-200 text-brand-700 shadow-sm mb-3">
          <Sprout size={28} />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
          KisanSetu Platform
        </h2>
        <p className="mt-1 text-xs text-brand-700 font-semibold">
          Smart Agricultural Market Linkage & Price Discovery
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="card p-6 sm:p-8 shadow-card bg-white">
          {/* Continue with Google Button */}
          {isGoogleAuthAvailable && (
            <div className="mb-5">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-stone-300 bg-white text-stone-700 font-semibold text-sm hover:bg-stone-50 hover:border-stone-400 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                {googleLoading ? "Connecting with Google..." : "Continue with Google"}
              </button>

              <div className="relative flex py-4 items-center">
                <div className="flex-grow border-t border-stone-200"></div>
                <span className="flex-shrink mx-3 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                  Or continue with email
                </span>
                <div className="flex-grow border-t border-stone-200"></div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">{t("login.username")}</label>
              <div className="relative">
                <input 
                  className="input pl-9" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  placeholder={t("login.usernamePlaceholder")} 
                  required 
                />
                <User size={15} className="absolute left-3 top-2.5 text-stone-400" />
              </div>
            </div>

            <div>
              <label className="field-label">{t("login.password")}</label>
              <div className="relative">
                <input 
                  className="input pl-9" 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                />
                <Lock size={15} className="absolute left-3 top-2.5 text-stone-400" />
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading} 
              className="btn-primary w-full py-2.5 text-sm font-bold shadow-sm"
            >
              {loading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </form>

          {/* Quick Demo Credentials Switcher */}
          <div className="mt-6 pt-5 border-t border-stone-100">
            <div className="text-[11px] font-bold text-dark-muted uppercase tracking-wider mb-2 text-center">
              Quick One-Click Demo Logins
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {DEMO_ACCOUNTS.map((d) => (
                <button
                  key={d.user}
                  type="button"
                  onClick={() => pickDemo(d.user)}
                  className={`text-[11px] font-semibold py-1.5 px-2 rounded-lg border text-center transition-all hover:scale-105 ${d.roleColor}`}
                  title={`Click to fill ${d.user}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-stone-400 text-center mt-1.5">
              Password is 'demo123' for all seeded accounts
            </div>
          </div>

          <div className="mt-5 text-center text-xs text-stone-500">
            {t("login.noAccount")}{" "}
            <Link to="/register" className="font-bold text-brand-600 hover:text-brand-700">
              {t("login.createAccount")}
            </Link>
          </div>
        </div>

        <div className="text-center mt-6">
          <Link to="/" className="text-xs text-stone-500 hover:text-stone-800 font-medium">
            ← Return to KisanSetu Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
