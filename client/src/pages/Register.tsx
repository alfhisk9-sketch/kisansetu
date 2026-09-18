import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { Sprout, Eye, EyeOff, CheckCircle2 } from "lucide-react";

type Role = "farmer" | "fpo" | "buyer";

const BUYER_TYPES = ["Processor", "Wholesaler", "Retail chain", "Institutional buyer", "Exporter", "Digital trader"];

export default function Register() {
  const { register } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>("farmer");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [village, setVillage] = useState("");
  const [district, setDistrict] = useState("");
  const [buyerType, setBuyerType] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function clientValidate(): string | null {
    if (!username.trim() || !displayName.trim() || !phone.trim() || !location.trim()) {
      return t("register.errMissing");
    }
    if (password.length < 6) return t("register.errPasswordLength");
    if (password !== confirmPassword) return t("register.errPasswordMismatch");
    if (role === "buyer" && !buyerType) return t("register.errBuyerType");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const clientErr = clientValidate();
    if (clientErr) {
      setError(clientErr);
      return;
    }
    setLoading(true);
    try {
      await register({
        username: username.trim(),
        password,
        confirmPassword,
        role,
        displayName: displayName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        village: village.trim() || undefined,
        district: district.trim() || undefined,
        buyerType: role === "buyer" ? buyerType : undefined,
      });
      setSuccess(true);
      setTimeout(() => navigate("/dashboard"), 900);
    } catch (err: any) {
      setError(err.message || t("register.errGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-4 justify-center">
          <Sprout className="text-brand-600" size={26} />
          <span className="text-xl font-semibold text-stone-900">KisanSetu</span>
        </div>

        <div className="card p-5">
          <h1 className="text-base font-semibold text-stone-800 mb-1">{t("register.title")}</h1>
          <p className="text-xs text-stone-500 mb-4">{t("register.subtitle")}</p>

          {success ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="text-brand-600" size={36} />
              <p className="text-sm font-medium text-stone-800">{t("register.successTitle")}</p>
              <p className="text-xs text-stone-500">{t("register.successNote")}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="field-label">{t("register.roleLabel")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["farmer", "fpo", "buyer"] as Role[]).map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRole(r)}
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                        role === r
                          ? "bg-brand-600 text-white border-brand-600"
                          : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
                      }`}
                    >
                      {t(`common.roles.${r}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">{t("register.username")}</label>
                  <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("register.usernamePlaceholder")} required />
                </div>
                <div>
                  <label className="field-label">{t("register.phone")}</label>
                  <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("register.phonePlaceholder")} required />
                </div>
              </div>

              <div>
                <label className="field-label">
                  {role === "farmer" ? t("register.fullName") : t("register.orgName")}
                </label>
                <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </div>

              <div>
                <label className="field-label">{t("register.location")}</label>
                <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("register.locationPlaceholder")} required />
              </div>

              {role === "farmer" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">{t("register.village")}</label>
                    <input className="input" value={village} onChange={(e) => setVillage(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">{t("register.district")}</label>
                    <input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} />
                  </div>
                </div>
              )}

              {role === "fpo" && (
                <div>
                  <label className="field-label">{t("register.district")}</label>
                  <input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} />
                </div>
              )}

              {role === "buyer" && (
                <div>
                  <label className="field-label">{t("register.buyerType")}</label>
                  <select className="input" value={buyerType} onChange={(e) => setBuyerType(e.target.value)} required>
                    <option value="">{t("register.buyerTypePlaceholder")}</option>
                    {BUYER_TYPES.map((bt) => (
                      <option key={bt} value={bt}>{bt}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="field-label">{t("register.password")}</label>
                <div className="relative">
                  <input
                    className="input pr-9"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    aria-label={showPassword ? t("register.hidePassword") : t("register.showPassword")}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="field-label">{t("register.confirmPassword")}</label>
                <input
                  className="input"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button className="btn-primary w-full" disabled={loading} type="submit">
                {loading ? t("register.creating") : t("register.createAccount")}
              </button>

              <p className="text-xs text-stone-500 text-center pt-1">
                {t("register.haveAccount")}{" "}
                <Link to="/login" className="text-brand-600 font-medium hover:underline">
                  {t("register.signInInstead")}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
