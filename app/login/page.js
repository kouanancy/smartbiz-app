"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Mail } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { PLANS, PLANS_INDISPONIBLES } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import FloatingBlobs from "@/components/FloatingBlobs";
import PlatformLogo from "@/components/PlatformLogo";
import HomeLink from "@/components/HomeLink";

// Page de connexion/inscription affichée avant qu'une boutique (et donc une
// langue) ne soit chargée — toujours en français, comme le reste de cette
// page (aucune autre chaîne ici ne passe par lib/i18n).
const t = (key, vars) => tBase("fr", key, vars);

export default function LoginPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [signupStep, setSignupStep] = useState("plan"); // 'plan' | 'form'
  const [selectedPlan, setSelectedPlan] = useState("autonome");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Écran dédié affiché juste après une inscription réussie sans session
  // immédiate (confirmation e-mail requise côté Supabase) — jamais mélangé
  // à l'écran de connexion habituel (tabs/formulaire masqués tant que
  // c'est actif) pour qu'il n'y ait aucune ambiguïté sur l'étape en cours.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  // Permet au site vitrine (app/page.js, components/LandingPage.js) de
  // pointer directement sur l'onglet inscription (/login#signup) plutôt
  // que de forcer un clic supplémentaire sur "Créer un compte". Toujours
  // après le premier rendu (jamais dans l'initialiseur de useState) : le
  // rendu serveur n'a pas accès à window.location.hash, donc lire le hash
  // dès l'initialiseur produirait un rendu client initial différent du
  // HTML serveur (onglet actif, étape affichée) — un vrai mismatch
  // d'hydratation, pas juste un avertissement cosmétique.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture ponctuelle de window.location au montage, seul moyen sûr d'éviter le mismatch d'hydratation ci-dessus
    if (window.location.hash === "#signup") setMode("signup");
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (password.length < 6) {
          throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
        }
        const trimmedBusinessName = businessName.trim();
        const metadata = { plan: selectedPlan };
        if (trimmedBusinessName) metadata.business_name = trimmedBusinessName;
        console.log("[signup] Appel de supabase.auth.signUp()", { email, plan: selectedPlan });
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: metadata },
        });
        if (signUpError) {
          console.error("[signup] supabase.auth.signUp() a échoué :", signUpError);
          throw signUpError;
        }

        // Le point exact qui distingue les deux scénarios possibles pour
        // "pas d'e-mail de confirmation reçu" : si hasSession est true, la
        // confirmation par e-mail est désactivée côté Supabase (Auth →
        // Providers → Email → "Confirm email") — aucun e-mail n'est censé
        // partir, ce n'est pas un bug. Si hasSession est false, Supabase a
        // accepté d'envoyer un e-mail de confirmation ; s'il n'arrive
        // jamais malgré ça, la cause est à chercher côté Supabase
        // (Authentication → Rate Limits, ou Authentication → Emails → SMTP
        // si un fournisseur personnalisé comme Resend est censé être
        // configuré) — rien dans le code de ce dépôt n'envoie cet e-mail,
        // il est entièrement géré par Supabase Auth.
        console.log("[signup] Résultat de signUp() :", {
          userId: data.user?.id ?? null,
          userConfirmedAt: data.user?.confirmed_at ?? null,
          hasSession: !!data.session,
        });

        if (data.session) {
          router.replace("/dashboard");
        } else {
          console.log(
            "[signup] Pas de session immédiate : confirmation par e-mail requise côté Supabase. " +
              "Si aucun e-mail n'arrive, vérifier Authentication → Rate Limits et Authentication → Emails (SMTP) dans le dashboard Supabase — ce dépôt n'envoie pas cet e-mail lui-même."
          );
          setAwaitingConfirmation(true);
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
      <HomeLink />
      <FloatingBlobs />
      <div className="sb-auth-card">
        <PlatformLogo />
        <p className="sb-auth-sub">Pilotez votre commerce, simplement.</p>

        {awaitingConfirmation ? (
          <div style={{ textAlign: "center" }}>
            <div className="sb-pending-icon" style={{ margin: "8px auto 16px" }}>
              <Mail size={24} />
            </div>
            <h1 className="sb-h1" style={{ marginBottom: 8 }}>
              Confirme ton adresse
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Vérifie ta boîte mail pour confirmer ton adresse et activer ton compte.</p>
          </div>
        ) : (
        <>
        <div className="sb-auth-tabs">
          <button
            type="button"
            className={`sb-auth-tab${mode === "login" ? " active" : ""}`}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Connexion
          </button>
          <button
            type="button"
            className={`sb-auth-tab${mode === "signup" ? " active" : ""}`}
            onClick={() => {
              if (mode !== "signup") setSignupStep("plan");
              setMode("signup");
              setError("");
            }}
          >
            Créer un compte
          </button>
        </div>

        {error && <div className="sb-auth-error">{error}</div>}

        {mode === "signup" && signupStep === "plan" ? (
          <div className="sb-auth-plans">
            <p className="sb-auth-plans-intro">Choisis la formule qui correspond le mieux à ton commerce.</p>
            {PLANS.map((key) => {
              const indisponible = PLANS_INDISPONIBLES.includes(key);
              return (
                <button
                  type="button"
                  key={key}
                  className={`sb-plan-card sb-auth-plan-option${selectedPlan === key ? " sb-plan-card-active" : ""}${indisponible ? " sb-plan-card-indisponible" : ""}`}
                  disabled={indisponible}
                  onClick={() => {
                    setSelectedPlan(key);
                    setSignupStep("form");
                  }}
                >
                  {indisponible && <span className="sb-plan-card-badge sb-badge sb-badge-amber">{t("parametres.formuleIndisponible")}</span>}
                  <div className="sb-plan-card-head">
                    <strong>{t(`common.plans.${key}.nom`)}</strong>
                  </div>
                  <p className="sb-plan-card-accroche">{t(`common.plans.${key}.accroche`)}</p>
                  <p className="sb-plan-card-description">{t(`common.plans.${key}.description`)}</p>
                  <ul className="sb-plan-card-avantages">
                    {t(`common.plans.${key}.avantages`).map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="sb-auth-selected-plan">
              <span>
                Formule choisie : <strong>{t(`common.plans.${selectedPlan}.nom`)}</strong>
              </span>
              <button type="button" className="sb-auth-plan-change" onClick={() => setSignupStep("plan")}>
                Changer
              </button>
            </div>
          )}
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
          {mode === "signup" && (
            <label className="sb-auth-consent">
              <input
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              <span>
                J&apos;ai lu et j&apos;accepte les{" "}
                <Link href="/cgu" target="_blank">
                  CGU
                </Link>{" "}
                et la{" "}
                <Link href="/confidentialite" target="_blank">
                  Politique de Confidentialité
                </Link>
              </span>
            </label>
          )}
          <button
            className="sb-btn sb-btn-emerald"
            style={{ width: "100%", justifyContent: "center" }}
            type="submit"
            disabled={loading || (mode === "signup" && !acceptedTerms)}
          >
            {loading ? "Un instant…" : mode === "signup" ? "Créer mon compte" : "Se connecter"}
          </button>
        </form>
        )}

        <p className="sb-auth-footer">
          {mode === "signup"
            ? "Un compte gratuit à créer, l'accès complet s'active après paiement de l'abonnement."
            : "Propulsé par Doka"}
        </p>
        </>
        )}
        <p className="sb-auth-legal-links">
          <Link href="/cgu" target="_blank">
            CGU
          </Link>{" "}
          · <Link href="/confidentialite" target="_blank">Confidentialité</Link>{" "}
          · <Link href="/mentions-legales" target="_blank">Mentions légales</Link>
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
