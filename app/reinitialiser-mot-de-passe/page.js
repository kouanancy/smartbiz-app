"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getAuthErrorMessage } from "@/lib/authErrors";
import FloatingBlobs from "@/components/FloatingBlobs";
import PlatformLogo from "@/components/PlatformLogo";
import HomeLink from "@/components/HomeLink";

// Destination du lien envoyé par supabase.auth.resetPasswordForEmail()
// (voir app/login/page.js, handleForgotPassword) : Supabase place un jeton
// de récupération dans l'URL au clic, que supabase-js analyse et échange
// automatiquement contre une session dès le chargement de la page
// (detectSessionInUrl, activé par défaut côté lib/supabaseClient.js) —
// aucune lecture manuelle du hash nécessaire ici, seulement une
// vérification de la session résultante via getSession()/onAuthStateChange
// avant d'autoriser le formulaire. Page autonome (hors du groupe (app)),
// même principe que app/login/page.js : toujours en français, jamais
// wrappée par le paywall/abonnement de app/(app)/layout.js, qui n'a pas de
// sens tant qu'aucun nouveau mot de passe n'a encore été choisi.
export default function ReinitialiserMotDePassePage() {
  const router = useRouter();
  const [pretAChanger, setPretAChanger] = useState(null); // null = vérification en cours
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setPretAChanger(!!session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setPretAChanger(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (nouveauMotDePasse.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (nouveauMotDePasse !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: nouveauMotDePasse });
    setLoading(false);
    if (err) {
      console.error("Erreur lors de la mise à jour du mot de passe :", err);
      setError(getAuthErrorMessage(err));
      return;
    }
    setSucces(true);
    setTimeout(() => router.replace("/dashboard"), 2000);
  }

  return (
    <div className="sb-auth-screen">
      <HomeLink />
      <FloatingBlobs />
      <div className="sb-auth-card">
        <PlatformLogo />
        <p className="sb-auth-sub">Pilotez votre commerce, simplement.</p>

        {succes ? (
          <div style={{ textAlign: "center" }}>
            <div className="sb-pending-icon" style={{ margin: "8px auto 16px" }}>
              <KeyRound size={24} />
            </div>
            <h1 className="sb-h1" style={{ marginBottom: 8 }}>
              Mot de passe mis à jour
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Redirection vers ton tableau de bord…</p>
          </div>
        ) : pretAChanger === false ? (
          <div style={{ textAlign: "center" }}>
            <h1 className="sb-h1" style={{ marginBottom: 8 }}>
              Lien invalide ou expiré
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              Ce lien de réinitialisation n&apos;est plus valide — demandes-en un nouveau depuis la page de connexion.
            </p>
            <Link href="/login" className="sb-btn sb-btn-emerald" style={{ justifyContent: "center" }}>
              Retour à la connexion
            </Link>
          </div>
        ) : pretAChanger === null ? (
          <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>Vérification du lien…</p>
        ) : (
          <>
            <h1 className="sb-h1" style={{ marginBottom: 4 }}>
              Nouveau mot de passe
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 16px" }}>
              Choisis un nouveau mot de passe pour ton compte.
            </p>
            {error && <div className="sb-auth-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="sb-auth-field">
                <label>Nouveau mot de passe</label>
                <div className="sb-auth-password-wrap">
                  <input
                    className="sb-input"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={nouveauMotDePasse}
                    onChange={(e) => setNouveauMotDePasse(e.target.value)}
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
              <div className="sb-auth-field">
                <label>Confirmer le mot de passe</label>
                <input
                  className="sb-input"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
              <button
                className="sb-btn sb-btn-emerald"
                style={{ width: "100%", justifyContent: "center" }}
                type="submit"
                disabled={loading}
              >
                {loading ? "Un instant…" : "Enregistrer le nouveau mot de passe"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
