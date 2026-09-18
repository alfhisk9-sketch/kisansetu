import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { Sprout, Lock, User, ArrowRight, ShieldCheck } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  function pickDemo(demoUser: string) {
    setUsername(demoUser);
    setPassword("demo123");
  }

  return (
    <div className="min-h-screen bg-page flex flex-col justify-center py-12 sm:px-6 lg:px-8">
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
