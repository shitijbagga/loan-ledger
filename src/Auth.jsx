import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("sign_in"); // 'sign_in' | 'sign_up'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } =
      mode === "sign_in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "Inter, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>{mode === "sign_in" ? "Log in" : "Create account"}</h2>
      <p style={{ color: "#6B7A78", fontSize: 14, marginBottom: 20 }}>
        Loan Ledger — sign {mode === "sign_in" ? "in" : "up"} to save and load your scenarios.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={inputStyle}
        />
        {error && <div style={{ color: "#BB6B3C", fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Please wait..." : mode === "sign_in" ? "Log in" : "Sign up"}
        </button>
      </form>
      <button
        onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
        style={{ marginTop: 14, background: "none", border: "none", color: "#1F4E5F", cursor: "pointer", fontSize: 13 }}
      >
        {mode === "sign_in" ? "Need an account? Sign up" : "Already have an account? Log in"}
      </button>
    </div>
  );
}

const inputStyle = {
  padding: "9px 11px",
  border: "1px solid #DCE2E0",
  borderRadius: 4,
  fontSize: 14,
  fontFamily: "inherit",
};

const buttonStyle = {
  padding: "9px 11px",
  background: "#1F4E5F",
  color: "white",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer",
};
