import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../lib/api";
import { User } from "../lib/types";

interface AuthState {
  user: User | null;
  profile: any | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
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

  useEffect(() => {
    const raw = localStorage.getItem("krishisetu_session");
    if (raw) {
      const parsed = JSON.parse(raw);
      setUser(parsed.user);
      setProfile(parsed.profile);
    }
    setLoading(false);
  }, []);

  async function login(username: string, password: string) {
    const data = await api.post("/auth/login", { username, password });
    setUser(data.user);
    setProfile(data.profile);
    localStorage.setItem("krishisetu_session", JSON.stringify(data));
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
  }

  return <AuthContext.Provider value={{ user, profile, loading, login, register, updateProfile, changePassword, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
