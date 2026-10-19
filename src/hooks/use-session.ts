"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Hook sesi untuk alur pendaftaran & langganan (port dari implementasi
 * standalone — sumber sesi disesuaikan: localStorage "auth" yang diisi
 * setelah login/daftar di aplikasi Darrell Soft, bukan /api/auth/me).
 */

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  sessionId?: string;
};

const AUTH_CHANGE_EVENT = "auth-change";

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    try {
      const authData = localStorage.getItem("auth");
      if (authData) {
        const parsed = JSON.parse(authData) as Partial<SessionUser>;
        if (parsed.id && parsed.username) {
          setUser({
            id: parsed.id,
            username: parsed.username,
            name: parsed.name ?? parsed.username,
            role: parsed.role ?? "user",
            sessionId: parsed.sessionId,
          });
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(AUTH_CHANGE_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, [refresh]);

  return {
    user,
    loading,
    refresh,
    isLoggedIn: !!user,
    isAdmin: user?.role === "admin" || user?.role === "superadmin",
  };
}
