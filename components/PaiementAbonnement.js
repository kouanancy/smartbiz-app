"use client";

import { useEffect, useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { PLAN_PRICES } from "@/lib/constants";
import ImageUploadField from "@/components/ImageUploadField";

const STATUT_BADGE_CLASS = {
  en_attente: "sb-badge-amber",
  reussi: "sb-badge-emerald",
  echoue: "sb-badge-coral",
};

// Composant partagé entre l'écran de blocage (premier paiement,
// réabonnement) et la carte Abonnement des Paramètres (pour un
// renouvellement anticipé pendant que le compte est encore actif/en
// essai) — même flux de paiement partout. Le prop `plan` (optionnel) sert
// aux parcours de choix de formule (premier paiement, réabonnement,
// changement de formule dans Paramètres) : quand il est fourni, le
// montant affiché/enregistré vient de PLAN_PRICES pour cette formule
// précise plutôt que du prix global de parametres_globaux.abonnement_prix
// (renouvellement générique, sans formule en jeu).
export default function PaiementAbonnement({ business, plan }) {
  const { refreshBusiness } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const prixPlan = plan ? PLAN_PRICES[plan] : null;
  const montantMensuel = prixPlan ? prixPlan.mensuel : undefined;
  const montantInstallation = prixPlan?.installation || 0;
  const [parametres, setParametres] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadMsg, setUploadMsg] = useState("");
  // Erreur de validation ou d'envoi — séparée de uploadMsg (réservé au
  // message de succès) pour ne jamais afficher une erreur dans le badge
  // vert de confirmation.
  const [erreurMsg, setErreurMsg] = useState("");
  // Photo déjà envoyée vers Supabase Storage mais pas encore soumise en
  // vérification — l'upload seul ne notifie plus l'administratrice, il
  // faut un clic explicite sur "Envoyer" (voir soumettreJustificatif).
  const [justificatifDraft, setJustificatifDraft] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  // Force le remontage d'ImageUploadField après un envoi réussi, pour
  // repartir d'une zone vide plutôt que de continuer à afficher la photo
  // déjà envoyée (qui, elle, reste "value" fixe à "" — voir plus bas).
  const [uploadKey, setUploadKey] = useState(0);

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [parametresRes, historiqueRes] = await Promise.all([
        supabase.from("parametres_globaux").select("*").limit(1).maybeSingle(),
        supabase
          .from("paiements_abonnement")
          .select("*")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setParametres(parametresRes.data || null);
      setHistorique(historiqueRes.data || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  // Séparé en deux étapes explicites : l'upload seul (ci-dessous) ne fait
  // que stocker la photo dans Supabase Storage et la garder en brouillon
  // local — seul un clic sur "Envoyer" (envoyerJustificatif) l'insère en
  // base et notifie l'administratrice. Évite qu'une simple sélection de
  // fichier parte en vérification avant que le commerçant ait pu se
  // relire/changer d'avis.
  async function envoyerJustificatif() {
    if (!justificatifDraft) {
      setErreurMsg(t("paiement.justificatifRequis"));
      return;
    }
    setUploadMsg("");
    setErreurMsg("");
    setEnvoiEnCours(true);
    const montantAPayer = prixPlan ? montantMensuel + montantInstallation : parametres?.abonnement_prix || 0;
    const { data, error } = await supabase
      .from("paiements_abonnement")
      .insert({
        business_id: business.id,
        montant: montantAPayer,
        statut: "en_attente",
        justificatif_url: justificatifDraft,
      })
      .select()
      .single();
    setEnvoiEnCours(false);
    if (error) {
      setErreurMsg(t("paiement.submitError", { message: error.message }));
      return;
    }
    setHistorique((prev) => [data, ...prev]);
    setUploadMsg(t("paiement.submitSuccess"));
    setJustificatifDraft("");
    setUploadKey((k) => k + 1);

    // Ce nouvel envoi devient le paiement le plus récent : sans ce
    // refreshBusiness, le message "ton dernier paiement n'a pas pu être
    // validé" (paiementRejete, lib/AuthProvider.js) resterait affiché en
    // haut de l'écran de blocage jusqu'à la prochaine navigation, alors que
    // ce nouvel envoi est justement la réponse à ce message.
    refreshBusiness();

    // Best effort : l'échec de la notification ne doit jamais empêcher le
    // commerçant de considérer son envoi comme réussi.
    fetch("/api/notify-admin-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName: business.name, plan: business.plan }),
    }).catch(() => {});
  }

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  const dernierPaiement = historique[0];
  // Une fois le compte actif — quelle que soit la façon dont il l'est
  // devenu (bouton "Marquer comme payé" ou modification manuelle directe
  // de subscription_status dans Supabase) — aucun message "en cours de
  // vérification"/"rejeté" n'a plus de sens : la logique se base donc sur
  // le statut du compte, jamais uniquement sur paiements_abonnement.statut.
  const compteActif = business?.subscription_status === "actif";
  const enAttente = !compteActif && dernierPaiement?.statut === "en_attente";
  const rejete = !compteActif && dernierPaiement?.statut === "echoue";

  return (
    <div>
      <div className="sb-trust-badge">
        <ShieldCheck size={14} /> {t("paiement.securise")}
      </div>

      {/* Un seul message à la fois, dans cet ordre de priorité : une erreur
          (validation avant envoi ou échec de l'envoi lui-même) prime sur la
          confirmation de succès, qui prime elle-même sur les statuts
          "en attente"/"rejeté" du dernier envoi déjà enregistré. */}
      {erreurMsg && (
        <div className="sb-badge sb-badge-coral" style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
          {erreurMsg}
        </div>
      )}
      {!erreurMsg && uploadMsg && (
        <div className="sb-badge sb-badge-emerald" style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
          {uploadMsg}
        </div>
      )}
      {!erreurMsg && !uploadMsg && enAttente && (
        <div className="sb-badge sb-badge-amber" style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
          {t("paiement.statutEnAttente")}
        </div>
      )}
      {!erreurMsg && !uploadMsg && !enAttente && rejete && (
        <div className="sb-badge sb-badge-coral" style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
          {t("paiement.statutRejete")}
          {dernierPaiement.raison_rejet && (
            <div style={{ marginTop: 4, fontWeight: 400 }}>
              {t("paiement.raisonRejetLabel")} {dernierPaiement.raison_rejet}
            </div>
          )}
        </div>
      )}

      <div className="sb-paiement-info">
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 8px" }}>
          {t("paiement.montantAPayer")}{" "}
          {prixPlan ? (
            <>
              <strong style={{ color: "var(--ink)" }}>
                {fmt(montantMensuel)}
                {t("parametres.formulePrixSuffixe")}
              </strong>
              {montantInstallation > 0 && (
                <span style={{ display: "block", color: "var(--accent-text)", fontWeight: 600, marginTop: 2 }}>
                  {t("parametres.formuleInstallation", { montant: fmt(montantInstallation) })}
                </span>
              )}
            </>
          ) : (
            <strong style={{ color: "var(--ink)" }}>{fmt(parametres?.abonnement_prix)}</strong>
          )}
        </p>
        {parametres?.wave_qr_url ? (
          <img src={parametres.wave_qr_url} alt="QR Wave" style={{ width: 160, height: 160, objectFit: "contain", borderRadius: 10, border: "1px solid var(--line)" }} />
        ) : parametres?.wave_telephone ? (
          <p style={{ fontSize: 13 }}>
            {t("paiement.payerViaTelephone")} <strong className="sb-mono">{parametres.wave_telephone}</strong>
          </p>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--muted)" }}>{t("paiement.aucunMoyenConfigure")}</p>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <ImageUploadField
          key={uploadKey}
          label={t("paiement.uploadLabel")}
          businessId={business.id}
          folder="justificatifs-paiement"
          value=""
          onChange={(url) => {
            setJustificatifDraft(url);
            if (url) setErreurMsg("");
          }}
        />
        {/* Toujours affiché, même sans photo chargée : un clic sans
            justificatif doit afficher une erreur claire (envoyerJustificatif)
            plutôt que de laisser le bouton absent sans explication. */}
        <button
          className="sb-btn sb-btn-primary"
          style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
          onClick={envoyerJustificatif}
          disabled={envoiEnCours}
        >
          <Send size={14} /> {envoiEnCours ? t("paiement.envoiEnCours") : t("paiement.envoyerJustificatif")}
        </button>
      </div>

      {historique.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="sb-section-title" style={{ fontSize: 13 }}>
            {t("paiement.historiqueTitle")}
          </div>
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("dashboard.colDate")}</th>
                  <th>{t("paiement.colMontant")}</th>
                  <th>{t("admin.colStatut")}</th>
                </tr>
              </thead>
              <tbody>
                {historique.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleDateString(dateLocale(business?.langue))}</td>
                    <td className="sb-mono">{fmt(p.montant)}</td>
                    <td>
                      <span className={`sb-badge ${STATUT_BADGE_CLASS[p.statut] || "sb-badge-amber"}`}>
                        {t(`paiement.statut.${p.statut}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
