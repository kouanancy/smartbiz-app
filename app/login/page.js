"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Mail } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { PLANS, PLANS_INDISPONIBLES, PLAN_PRICES } from "@/lib/constants";
import { fmt } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { getAuthErrorMessage } from "@/lib/authErrors";
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
  // Écran "mot de passe oublié", même principe que awaitingConfirmation
  // ci-dessus (remplace entièrement tabs/formulaire tant qu'actif, jamais
  // mélangé) — resetSent affiche un message volontairement identique que
  // l'adresse corresponde ou non à un compte existant (Supabase ne
  // renvoie de toute façon aucune erreur dans ce cas précis, justement
  // pour ne jamais révéler si une adresse est inscrite).
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

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

  async function handleForgotPassword(e) {
    e.preventDefault();
    setResetError("");
    setResetLoading(true);
    // redirectTo doit figurer dans la liste des Redirect URLs autorisées du
    // projet Supabase (Authentication → URL Configuration), sans quoi
    // Supabase ignore ce paramètre et renvoie vers la Site URL par défaut —
    // voir README, section « Mot de passe oublié / changement de mot de
    // passe ».
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
    });
    setResetLoading(false);
    if (err) {
      console.error("Erreur lors de la demande de réinitialisation :", err);
      setResetError(getAuthErrorMessage(err));
      return;
    }
    setResetSent(true);
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
        ) : forgotPasswordOpen ? (
          <div>
            <h1 className="sb-h1" style={{ marginBottom: 4 }}>
              Mot de passe oublié
            </h1>
            {resetSent ? (
              <>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 16px" }}>
                  Si un compte existe avec l&apos;adresse <strong>{resetEmail}</strong>, un e-mail contenant un lien de
                  réinitialisation vient d&apos;être envoyé. Pense à vérifier tes spams.
                </p>
                <button
                  type="button"
                  className="sb-btn sb-btn-emerald"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => {
                    setForgotPasswordOpen(false);
                    setResetSent(false);
                    setResetEmail("");
                  }}
                >
                  Retour à la connexion
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 16px" }}>
                  Indique l&apos;adresse e-mail de ton compte, on t&apos;envoie un lien pour choisir un nouveau mot de
                  passe.
                </p>
                {resetError && <div className="sb-auth-error">{resetError}</div>}
                <form onSubmit={handleForgotPassword}>
                  <div className="sb-auth-field">
                    <label>E-mail</label>
                    <input
                      className="sb-input"
                      type="email"
                      required
                      placeholder="ex. maboutique@gmail.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                  <button
                    className="sb-btn sb-btn-emerald"
                    style={{ width: "100%", justifyContent: "center" }}
                    type="submit"
                    disabled={resetLoading}
                  >
                    {resetLoading ? "Un instant…" : "Envoyer le lien de réinitialisation"}
                  </button>
                </form>
                <button
                  type="button"
                  className="sb-auth-plan-change"
                  style={{ display: "block", margin: "14px auto 0" }}
                  onClick={() => {
                    setForgotPasswordOpen(false);
                    setResetError("");
                  }}
                >
                  ← Retour à la connexion
                </button>
              </>
            )}
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
                  <div className="sb-plan-card-price">
                    {fmt(PLAN_PRICES[key].mensuel)}
                    <span>{t("parametres.formulePrixSuffixe")}</span>
                  </div>
                  {PLAN_PRICES[key].installation && (
                    <p className="sb-plan-card-installation">
                      {t("parametres.formuleInstallation", { montant: fmt(PLAN_PRICES[key].installation) })}
                    </p>
                  )}
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
            {mode === "login" && (
              <button
                type="button"
                className="sb-auth-plan-change"
                style={{ display: "block", marginTop: 6 }}
                onClick={() => {
                  setForgotPasswordOpen(true);
                  setResetEmail(email);
                  setResetSent(false);
                  setResetError("");
                }}
              >
                Mot de passe oublié ?
              </button>
            )}
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
