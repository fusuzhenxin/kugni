"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { api, send } from "@/lib/client-api";
import type { SessionData, User } from "@/lib/types";

interface AuthContext {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: (redirect?: string) => Promise<void>;
}
const Auth = createContext<AuthContext>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});
export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const s = await api<SessionData>("/auth/session/");
      setUser(s.user);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);
  const logout = async (redirect = "/") => {
    await send("/auth/logout/");
    setUser(null);
    window.location.assign(redirect);
  };
  return (
    <Auth.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </Auth.Provider>
  );
}
export const useAuth = () => useContext(Auth);
