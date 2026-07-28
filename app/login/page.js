"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { rememberPendingBusinessName, useAuth } from "@/lib/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      // Toujours logguer l'erreur brute : utile pour diagnostiquer via la
      // console du navigateur si le message affiché reste générique.
      console.error("Erreur d'authentification Supabase :", err);
      setError(getAuthErrorMessage(err));
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
            <div className="sb-auth-password-wrap">
              <input
                className="sb-input"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="sb-auth-password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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

function getAuthErrorMessage(err) {
  const message = typeof err?.message === "string" ? err.message : "";
  const status = err?.status;

  if (message.includes("Invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (message.includes("User already registered")) return "Un compte existe déjà avec cet e-mail.";
  if (message.includes("Email not confirmed"))
    return "Confirme d'abord ton adresse e-mail (lien envoyé à l'inscription).";
  if (message.includes("rate limit"))
    return "Trop de tentatives — patiente quelques minutes avant de réessayer.";
  if (message.toLowerCase().includes("password"))
    return "Le mot de passe ne respecte pas les critères requis (6 caractères minimum).";

  // La librairie Supabase renvoie parfois un message vide ou "{}" quand la
  // réponse du serveur ne correspond à aucun format attendu (ex. panne
  // réseau, mauvaise URL de projet, service temporairement indisponible).
  // Dans ce cas on affiche un message clair plutôt que de montrer ce texte
  // brut — le détail exact reste visible dans la console du navigateur.
  const isUnusableMessage = !message || message === "{}" || message === "[object Object]";
  if (isUnusableMessage) {
    return status
      ? `Le service d'authentification est inaccessible ou a répondu de façon inattendue (code ${status}). Réessaie dans un instant.`
      : "Impossible de contacter le service d'authentification. Vérifie ta connexion et réessaie.";
  }

  return message;
}
