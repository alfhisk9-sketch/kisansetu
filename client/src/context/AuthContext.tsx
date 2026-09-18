import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../lib/api";
import { User } from "../lib/types";
import { supabase, isSupabaseClientConfigured } from "../lib/supabase";

export interface PendingOAuthUser {
  email: string;
  fullName: string;
  supabaseUserId: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isGoogleAuthAvailable: boolean;
  needsRoleSelection: boolean;
  pendingOAuthUser: PendingOAuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  completeOAuthRegistration: (role: "farmer" | "buyer" | "fpo") => Promise<void>;
  cancelOAuthRegistration: () => void;
  register: (payload: Record<string, any>) => Promise<void>;
  updateProfile: (payload: Record<string, any>) => Promise<void>;
  changePassword: (payload: Record<string, any>) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);
  const [pendingOAuthUser, setPendingOAuthUser] = useState<PendingOAuthUser | null>(null);

  useEffect(() => {
    // 1. Restore local session if present
    const raw = localStorage.getItem("krishisetu_session");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setUser(parsed.user);
        setProfile(parsed.profile);
      } catch (_) {}
    }

    // 2. Check for Supabase OAuth redirect or active Supabase session
    if (supabase && isSupabaseClientConfigured) {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session?.user && !raw) {
          await handleSupabaseUser(session.user);
        }
      });

      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user) {
          const currentLocal = localStorage.getItem("krishisetu_session");
          if (!currentLocal) {
            await handleSupabaseUser(session.user);
          }
        }
      });

      setLoading(false);
      return () => {
        authListener.subscription.unsubscribe();
      };
    } else {
      setLoading(false);
    }
  }, []);

  async function handleSupabaseUser(sbUser: any) {
    try {
      const email = sbUser.email || "";
      const fullName = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || email.split("@")[0];
      const avatarUrl = sbUser.user_metadata?.avatar_url || null;

      const res = await api.post("/auth/sync-oauth", {
        email,
        fullName,
        avatarUrl,
        supabaseUserId: sbUser.id,
      });

      if (res.needsRoleSelection) {
        setNeedsRoleSelection(true);
        setPendingOAuthUser({
          email,
          fullName,
          supabaseUserId: sbUser.id,
          avatarUrl,
        });
      } else if (res.user) {
        setUser(res.user);
        setProfile(res.profile);
        localStorage.setItem("krishisetu_session", JSON.stringify(res));
      }
    } catch (err) {
      console.warn("OAuth sync error:", err);
    }
  }

  async function login(username: string, password: string) {
    const data = await api.post("/auth/login", { username, password });
    setUser(data.user);
    setProfile(data.profile);
    localStorage.setItem("krishisetu_session", JSON.stringify(data));
  }

  async function loginWithGoogle() {
    if (!supabase || !isSupabaseClientConfigured) {
      throw new Error("Supabase Auth is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.");
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) throw error;
  }

  async function completeOAuthRegistration(role: "farmer" | "buyer" | "fpo") {
    if (!pendingOAuthUser) throw new Error("No pending OAuth registration found");

    const data = await api.post("/auth/sync-oauth", {
      ...pendingOAuthUser,
      role,
    });

    setUser(data.user);
    setProfile(data.profile);
    setNeedsRoleSelection(false);
    setPendingOAuthUser(null);
    localStorage.setItem("krishisetu_session", JSON.stringify(data));
  }

  function cancelOAuthRegistration() {
    setNeedsRoleSelection(false);
    setPendingOAuthUser(null);
    if (supabase) supabase.auth.signOut();
  }

  async function register(payload: Record<string, any>) {
    const data = await api.post("/auth/register", payload);
    setUser(data.user);
    setProfile(data.profile);
    localStorage.setItem("krishisetu_session", JSON.stringify(data));
  }

  async function updateProfile(payload: Record<string, any>) {
    if (!user) throw new Error("Not signed in");
    const data = await api.patch("/auth/profile", { userId: user.id, ...payload });
    setUser(data.user);
    setProfile(data.profile);
    localStorage.setItem("krishisetu_session", JSON.stringify(data));
  }

  async function changePassword(payload: Record<string, any>) {
    if (!user) throw new Error("Not signed in");
    await api.post("/auth/change-password", { userId: user.id, ...payload });
  }

  function logout() {
    setUser(null);
    setProfile(null);
    localStorage.removeItem("krishisetu_session");
    if (supabase) {
      supabase.auth.signOut().catch(() => {});
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isGoogleAuthAvailable: isSupabaseClientConfigured,
        needsRoleSelection,
        pendingOAuthUser,
        login,
        loginWithGoogle,
        completeOAuthRegistration,
        cancelOAuthRegistration,
        register,
        updateProfile,
        changePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
