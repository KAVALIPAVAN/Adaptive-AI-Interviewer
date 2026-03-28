import { useState } from "react";
import { useAuth } from "./AuthContext";

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode]     = useState("login"); // login | register
  const [form, setForm]     = useState({ name: "", email: "", password: "" });
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        if (!form.name.trim()) { setError("Name is required."); setLoading(false); return; }
        await register(form.name, form.email, form.password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0A0A0F",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'IBM Plex Mono', monospace", padding: 24,
      backgroundImage: "radial-gradient(ellipse 60% 40% at 50% 0%, #0D0D28 0%, #0A0A0F 70%)"
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#E8E8FF", margin: 0 }}>
            AI Interviewer
          </h1>
          <p style={{ fontSize: 11, color: "#444", marginTop: 8, letterSpacing: 1 }}>
            ADAPTIVE · PERSONALIZED · TRACKED
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "#0D0D18", border: "1px solid #1A1A2E",
          borderRadius: 16, padding: "32px 28px"
        }}>
          {/* Tab switcher */}
          <div style={{
            display: "flex", background: "#080810", borderRadius: 8,
            padding: 3, marginBottom: 28
          }}>
            {["login", "register"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1, padding: "8px 0", border: "none", borderRadius: 6,
                  background: mode === m ? "#1A1A2E" : "transparent",
                  color: mode === m ? "#E2E2FF" : "#555",
                  fontSize: 11, letterSpacing: 1, cursor: "pointer",
                  textTransform: "uppercase", transition: "all .2s"
                }}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            {/* Name field — register only */}
            {mode === "register" && (
              <Field label="Full Name" type="text" value={form.name}
                onChange={v => set("name", v)} placeholder="Ada Lovelace" />
            )}
            <Field label="Email" type="email" value={form.email}
              onChange={v => set("email", v)} placeholder="you@example.com" />
            <Field label="Password" type="password" value={form.password}
              onChange={v => set("password", v)}
              placeholder={mode === "register" ? "Min 6 characters" : "Your password"}
            />

            {/* Error */}
            {error && (
              <div style={{
                padding: "10px 14px", background: "#1A0A0A", border: "1px solid #3A1515",
                borderRadius: 8, color: "#EF4444", fontSize: 11, marginBottom: 16, lineHeight: 1.6
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "13px", background: loading ? "#1A1A2E" : "#4F8EF7",
                border: "none", borderRadius: 10, color: "#fff",
                fontSize: 12, fontFamily: "inherit", fontWeight: 700,
                letterSpacing: 1, cursor: loading ? "not-allowed" : "pointer",
                transition: "all .2s", marginTop: 4
              }}
            >
              {loading ? "Please wait..." : mode === "login" ? "SIGN IN →" : "CREATE ACCOUNT →"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#444" }}>
            {mode === "login" ? "No account? " : "Already have one? "}
            <span
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              style={{ color: "#4F8EF7", cursor: "pointer" }}
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </span>
          </p>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 9, color: "#222", letterSpacing: 1 }}>
          YOUR DATA IS PRIVATE · SESSIONS SAVED PER ACCOUNT
        </p>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, display: "block", marginBottom: 6 }}>
        {label.toUpperCase()}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        style={{
          width: "100%", padding: "11px 14px",
          background: "#080810",
          border: `1px solid ${focused ? "#4F8EF7" : "#1A1A2E"}`,
          borderRadius: 8, color: "#E2E2FF",
          fontSize: 13, fontFamily: "inherit", outline: "none",
          transition: "border-color .2s", boxSizing: "border-box"
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}
