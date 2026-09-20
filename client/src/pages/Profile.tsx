import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { UserCircle2 } from "lucide-react";

export default function Profile() {
  const { user, profile, updateProfile, changePassword } = useAuth();
  const { t } = useLocale();

  const roleProf = profile?.roleProfile || profile;
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [location, setLocation] = useState(user?.location || "");
  const [village, setVillage] = useState(roleProf?.village || "");
  const [district, setDistrict] = useState(roleProf?.district || "");

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setPhone(user.phone || "");
      setLocation(user.location || "");
    }
    const rp = profile?.roleProfile || profile;
    if (rp) {
      if (rp.village) setVillage(rp.village);
      if (rp.district) setDistrict(rp.district);
    }
  }, [user, profile]);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordErr, setPasswordErr] = useState("");

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileErr("");
    setProfileMsg("");
    setSavingProfile(true);
    try {
      const payload: Record<string, any> = { displayName, phone, location };
      if (user?.role === "farmer" || user?.role === "fpo") {
        payload.district = district;
        if (user?.role === "farmer") payload.village = village;
      }
      await updateProfile(payload);
      setProfileMsg(t("profile.savedNote"));
    } catch (err: any) {
      setProfileErr(err.message || t("profile.errGeneric"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    setPasswordErr("");
    setPasswordMsg("");
    if (newPassword.length < 6) {
      setPasswordErr(t("register.errPasswordLength"));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordErr(t("register.errPasswordMismatch"));
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword, confirmNewPassword });
      setPasswordMsg(t("profile.passwordChangedNote"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      setPasswordErr(err.message || t("profile.errGeneric"));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <UserCircle2 className="text-brand-600" size={24} />
        <h1 className="text-lg font-semibold text-stone-800">{t("profile.title")}</h1>
      </div>

      <form onSubmit={handleProfileSave} className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">{t("profile.accountDetails")}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t("profile.username")}</label>
            <input className="input bg-stone-100 text-stone-500" value={user?.username || ""} disabled />
          </div>
          <div>
            <label className="field-label">{t("profile.role")}</label>
            <input className="input bg-stone-100 text-stone-500" value={user ? t(`common.roles.${user.role}`) : ""} disabled />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t("register.fullName")}</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">{t("register.phone")}</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="field-label">{t("register.location")}</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} required />
        </div>
        {user?.role === "farmer" && (
          <div className="grid sm:grid-cols-2 gap-3">
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
        {user?.role === "fpo" && (
          <div>
            <label className="field-label">{t("register.district")}</label>
            <input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} />
          </div>
        )}
        {profileErr && <p className="text-xs text-red-600">{profileErr}</p>}
        {profileMsg && <p className="text-xs text-brand-700">{profileMsg}</p>}
        <button className="btn-primary" disabled={savingProfile} type="submit">
          {savingProfile ? t("profile.saving") : t("profile.saveChanges")}
        </button>
      </form>

      <form onSubmit={handlePasswordSave} className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-stone-800">{t("profile.changePassword")}</h2>
        <div>
          <label className="field-label">{t("profile.currentPassword")}</label>
          <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">{t("register.password")}</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">{t("register.confirmPassword")}</label>
            <input className="input" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required />
          </div>
        </div>
        {passwordErr && <p className="text-xs text-red-600">{passwordErr}</p>}
        {passwordMsg && <p className="text-xs text-brand-700">{passwordMsg}</p>}
        <button className="btn-primary" disabled={savingPassword} type="submit">
          {savingPassword ? t("profile.saving") : t("profile.changePassword")}
        </button>
      </form>
    </div>
  );
}
