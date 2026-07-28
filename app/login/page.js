"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { rememberPendingBusinessName, useAuth } from "@/lib/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (password.length < 6) {
          throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
        }
        rememberPendingBusinessName(businessName);
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;

        if (data.session) {
          router.replace("/dashboard");
        } else {
          setInfo(
            "Compte créé ! Vérifie ta boîte e-mail pour confirmer ton adresse, puis connecte-toi ci-dessous."
          );
          setMode("login");
          setPassword("");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(translateError(err?.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sb-auth-screen">
      <div className="sb-auth-card">
        <div className="sb-auth-brand">
          Smart<span>Biz</span>
        </div>
        <p className="sb-auth-sub">Pilotez votre commerce, simplement.</p>

        <div className="sb-auth-tabs">
          <button
            type="button"
            className={`sb-auth-tab${mode === "login" ? " active" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
              setInfo("");
            }}
          >
            Connexion
          </button>
          <button
            type="button"
            className={`sb-auth-tab${mode === "signup" ? " active" : ""}`}
            onClick={() => {
              setMode("signup");
              setError("");
              setInfo("");
            }}
          >
            Créer un compte
          </button>
        </div>

        {error && <div className="sb-auth-error">{error}</div>}
        {info && <div className="sb-auth-info">{info}</div>}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="sb-auth-field">
              <label>Nom de la boutique (facultatif)</label>
              <input
                className="sb-input"
                placeholder="Ex. Chez Aïcha Beauté"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
          )}
          <div className="sb-auth-field">
            <label>E-mail</label>
            <input
              className="sb-input"
              type="email"
              required
              placeholder="ex. maboutique@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="sb-auth-field">
            <label>Mot de passe</label>
            <input
              className="sb-input"
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            className="sb-btn sb-btn-emerald"
            style={{ width: "100%", justifyContent: "center" }}
            type="submit"
            disabled={loading}
          >
            {loading ? "Un instant…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
          </button>
        </form>

        <p className="sb-auth-footer">
          {mode === "signup"
            ? "Un compte gratuit à créer, l'accès complet s'active après paiement de l'abonnement."
            : "Propulsé par SmartBiz"}
        </p>
      </div>
    </div>
  );
}

function translateError(message) {
  if (!message) return "Une erreur est survenue, réessaie.";
  if (message.includes("Invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (message.includes("User already registered")) return "Un compte existe déjà avec cet e-mail.";
  if (message.includes("Email not confirmed"))
    return "Confirme d'abord ton adresse e-mail (lien envoyé à l'inscription).";
  return message;
}
