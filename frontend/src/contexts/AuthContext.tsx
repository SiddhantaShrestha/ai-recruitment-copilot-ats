"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  fetchAuthMe,
  getStoredToken,
  loginWithPassword,
  setStoredToken,
  type AuthUser,
} from "@/lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_STORAGE_KEY = "auth_user";

function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: AuthUser | null): void {
  if (typeof window === "undefined") return;
  if (user == null) localStorage.removeItem(USER_STORAGE_KEY);
  else localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setStoredUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await fetchAuthMe();
      setUser(me);
      setStoredUser(me);
    } catch {
      setStoredToken(null);
      setStoredUser(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token, user: u } = await loginWithPassword(email, password);
      setStoredToken(token);
      setUser(u);
      setStoredUser(u);
      router.push("/candidates");
    },
    [router]
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setStoredUser(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const value: AuthContextValue = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
