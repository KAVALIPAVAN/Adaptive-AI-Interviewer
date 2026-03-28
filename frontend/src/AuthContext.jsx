import { createContext, useContext, useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(() => localStorage.getItem("ai_token"));
  const [loading, setLoading] = useState(true);

  // Verify token on app load
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setUser(data);
        else { localStorage.removeItem("ai_token"); setToken(null); }
      })
      .catch(() => { localStorage.removeItem("ai_token"); setToken(null); })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res  = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Login failed");
    localStorage.setItem("ai_token", data.access_token);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res  = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Registration failed");
    localStorage.setItem("ai_token", data.access_token);
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ai_token");
    setToken(null);
    setUser(null);
  }, []);

  const authFetch = useCallback(async (path, options = {}) => {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {})
      }
    });
    if (res.status === 401) { logout(); throw new Error("Session expired. Please log in again."); }
    return res;
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
