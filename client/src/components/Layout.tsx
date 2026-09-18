import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale, LOCALES, Locale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import {
  LayoutDashboard, TrendingUp, GitCompareArrows, Store, PackagePlus, Users,
  Truck, Warehouse, Receipt, AlertTriangle, ShieldCheck, LogOut, Sprout, 
  MessageCircleQuestion, Globe, Bell, WifiOff, LineChart, UserCircle2, 
  Menu, X, ChevronRight, Sparkles
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

interface NavItem {
  to: string;
  labelKey: string;
  icon: ReactNode;
  roles: string[];
}

interface AppNotification {
  id: string;
  user_id: string;
  message: string;
  read: number;
  created_at: string;
}

const ROLE_KEY: Record<string, string> = {
  farmer: "common.roles.farmer",
  fpo: "common.roles.fpo",
  buyer: "common.roles.buyer",
  admin: "common.roles.admin",
};

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: <LayoutDashboard size={19} />, roles: ["farmer", "fpo", "buyer", "admin"] },
  { to: "/market-intelligence", labelKey: "nav.marketIntelligence", icon: <TrendingUp size={19} />, roles: ["farmer", "fpo"] },
  { to: "/compare", labelKey: "nav.marketComparison", icon: <GitCompareArrows size={19} />, roles: ["farmer", "fpo"] },
  { to: "/lots", labelKey: "nav.myLots", icon: <PackagePlus size={19} />, roles: ["farmer", "fpo"] },
  { to: "/marketplace", labelKey: "nav.buyerMarketplace", icon: <Store size={19} />, roles: ["farmer", "fpo", "buyer"] },
  { to: "/assistant", labelKey: "nav.assistant", icon: <MessageCircleQuestion size={19} />, roles: ["farmer", "fpo", "buyer"] },
  { to: "/forecast", labelKey: "nav.forecast", icon: <LineChart size={19} />, roles: ["farmer", "fpo"] },
  { to: "/storage", labelKey: "nav.storage", icon: <Warehouse size={19} />, roles: ["farmer", "fpo"] },
  { to: "/transactions", labelKey: "nav.transactions", icon: <Truck size={19} />, roles: ["farmer", "fpo", "buyer"] },
  { to: "/fpo-aggregation", labelKey: "nav.fpoAggregation", icon: <Users size={19} />, roles: ["fpo"] },
  { to: "/grievances", labelKey: "nav.grievances", icon: <AlertTriangle size={19} />, roles: ["farmer", "fpo", "buyer", "admin"] },
  { to: "/admin", labelKey: "nav.adminDashboard", icon: <ShieldCheck size={19} />, roles: ["admin"] },
];

// 5 primary farmer mobile navigation items
const MOBILE_PRIMARY_TABS = [
  { to: "/dashboard", label: "Home", icon: <LayoutDashboard size={20} /> },
  { to: "/market-intelligence", label: "Markets", icon: <TrendingUp size={20} /> },
  { to: "/lots", label: "Sell", icon: <PackagePlus size={20} /> },
  { to: "/marketplace", label: "Offers", icon: <Store size={20} /> },
  { to: "/assistant", label: "AI Saathi", icon: <Sparkles size={20} className="text-amber-500" /> },
];

function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200/80 rounded-lg px-2.5 py-1.5 transition-colors ${compact ? "" : "w-full justify-between"}`}
        aria-label={t("layout.language")}
      >
        <div className="flex items-center gap-1.5">
          <Globe size={15} className="text-brand-600" />
          <span>{LOCALES.find((l) => l.code === locale)?.nativeLabel}</span>
        </div>
        {!compact && <span className="text-[10px] text-stone-400">▼</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 bottom-full mb-1 right-0 md:bottom-auto md:top-full md:mt-1 bg-white border border-stone-200 rounded-xl shadow-xl py-1.5 min-w-[140px] animate-in fade-in">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => { setLocale(l.code as Locale); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2 text-xs hover:bg-brand-50 flex items-center justify-between transition-colors ${locale === l.code ? "text-brand-700 font-bold bg-brand-50/50" : "text-stone-700"}`}
              >
                <span>{l.nativeLabel}</span>
                {locale === l.code && <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NotificationBell() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  async function refresh() {
    if (!user) return;
    try {
      const rows = await api.get(`/notifications?userId=${user.id}`);
      setNotifications(rows);
    } catch {
      // Keep stale in case of temporary disconnect
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function markRead(n: AppNotification) {
    if (n.read) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: 1 } : x)));
    try {
      await api.patch(`/notifications/${n.id}/read`);
    } catch {
      refresh();
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200/80 rounded-lg h-9 w-9 transition-colors"
        aria-label={t("layout.notifications")}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full mt-2 right-0 bg-white border border-stone-200 rounded-xl shadow-xl py-2 w-80 max-h-80 overflow-y-auto animate-in fade-in">
            <div className="px-3.5 py-1.5 border-b border-stone-100 flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800">{t("layout.notifications")}</span>
              {unreadCount > 0 && <span className="text-[10px] text-brand-600 font-semibold">{unreadCount} new</span>}
            </div>
            {notifications.length === 0 && (
              <div className="px-4 py-6 text-xs text-stone-400 text-center">{t("layout.noNotifications")}</div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n)}
                className={`w-full text-left px-3.5 py-2.5 text-xs border-b border-stone-50 last:border-0 hover:bg-stone-50 flex items-start gap-2.5 transition-colors ${!n.read ? "bg-brand-50/40" : ""}`}
              >
                {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-600 shrink-0" />}
                <span className={`flex-1 ${!n.read ? "text-stone-900 font-semibold" : "text-stone-500"}`}>{n.message}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OfflineStatus() {
  const { t } = useLocale();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs mb-4 shadow-sm">
        <WifiOff size={15} className="shrink-0 text-amber-600" />
        <span className="font-medium">{t("layout.offlineBanner")}</span>
      </div>
    );
  }

  return null;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  if (!user) return null;

  const items = NAV_ITEMS.filter((i) => i.roles.includes(user.role));

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-page">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-stone-200/80 bg-white">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-stone-100">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200/60 flex items-center justify-center text-brand-700 shadow-sm">
            <Sprout size={22} />
          </div>
          <div>
            <div className="font-bold text-stone-900 leading-tight text-base tracking-tight">KisanSetu</div>
            <div className="text-[11px] text-brand-600 font-semibold tracking-wide">कृषि सेतु प्लेटफार्म</div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive 
                    ? "bg-brand-50 text-brand-800 shadow-sm border border-brand-200/60" 
                    : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                }`
              }
            >
              <span className="text-brand-600">{item.icon}</span>
              <span className="flex-1 truncate">{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Profile & Actions Footer */}
        <div className="border-t border-stone-100 p-3.5 space-y-3 bg-stone-50/50">
          <div className="flex items-center justify-between">
            <NavLink to="/profile" className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                {user.display_name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-stone-800 truncate">{user.display_name}</div>
                <div className="text-[10px] text-brand-600 font-semibold capitalize">{t(ROLE_KEY[user.role] || "common.roles.farmer")}</div>
              </div>
            </NavLink>
            <NotificationBell />
          </div>

          <LanguageSwitcher />

          <button onClick={handleLogout} className="btn-secondary w-full text-xs py-2">
            <LogOut size={14} /> {t("layout.logout")}
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-stone-200/80 bg-white sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
            <Sprout size={18} />
          </div>
          <span className="font-bold text-sm tracking-tight text-stone-900">KisanSetu</span>
        </div>
        
        <div className="flex items-center gap-2">
          <NotificationBell />
          <LanguageSwitcher compact />
          <button 
            onClick={() => setMobileDrawerOpen(true)}
            className="p-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Mobile Slide-over Drawer for secondary features */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileDrawerOpen(false)} />
          <div className="relative w-72 bg-white h-full shadow-2xl flex flex-col p-4 z-10 animate-in slide-in-from-right">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-3">
              <div className="flex items-center gap-2">
                <Sprout className="text-brand-600" size={20} />
                <span className="font-bold text-sm">Menu & Settings</span>
              </div>
              <button onClick={() => setMobileDrawerOpen(false)} className="p-1.5 text-stone-400 hover:text-stone-700">
                <X size={20} />
              </button>
            </div>

            {/* Profile Overview */}
            <NavLink 
              to="/profile" 
              onClick={() => setMobileDrawerOpen(false)}
              className="p-3 bg-stone-50 rounded-xl mb-3 flex items-center gap-3 border border-stone-200/60"
            >
              <div className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-sm">
                {user.display_name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-xs text-stone-900 truncate">{user.display_name}</div>
                <div className="text-[10px] text-brand-600 font-semibold capitalize">{t(ROLE_KEY[user.role] || "common.roles.farmer")}</div>
              </div>
              <ChevronRight size={16} className="text-stone-400" />
            </NavLink>

            {/* Navigation List */}
            <div className="flex-1 overflow-y-auto space-y-1 py-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      isActive ? "bg-brand-50 text-brand-800" : "text-stone-700 hover:bg-stone-50"
                    }`
                  }
                >
                  <span className="text-brand-600">{item.icon}</span>
                  <span className="flex-1 truncate">{t(item.labelKey)}</span>
                </NavLink>
              ))}
            </div>

            <div className="pt-3 border-t border-stone-100">
              <button onClick={handleLogout} className="btn-secondary w-full text-xs py-2 text-red-600 hover:bg-red-50">
                <LogOut size={15} /> {t("layout.logout")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Page Content */}
      <main className="flex-1 min-w-0 pb-20 md:pb-6">
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          <OfflineStatus />
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation (5 Primary Farmer Tabs) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-stone-200/80 flex justify-around items-center h-16 z-20 shadow-elevated">
        {MOBILE_PRIMARY_TABS.map((tab) => {
          const isActive = location.pathname === tab.to;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
                isActive ? "text-brand-700 font-bold scale-105" : "text-stone-500 font-medium"
              }`}
            >
              <div className={`p-1 rounded-xl transition-colors ${isActive ? "bg-brand-50" : ""}`}>
                {tab.icon}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5">{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
