"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import ImageUploadField from "@/components/ImageUploadField";

const STATUT_BADGE_CLASS = {
  en_attente: "sb-badge-amber",
  reussi: "sb-badge-emerald",
  echoue: "sb-badge-coral",
};

// Composant partagé entre l'écran de blocage (PendingSubscription, seul
// endroit accessible à un compte bloqué) et la carte Abonnement des
// Paramètres (pour un renouvellement anticipé pendant que le compte est
// encore actif/en essai) — même flux de paiement dans les deux cas.
export default function PaiementAbonnement({ business }) {
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [parametres, setParametres] = useState(null);
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadMsg, setUploadMsg] = useState("");

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

  async function soumettreJustificatif(url) {
    if (!url) return;
    setUploadMsg("");
    const { data, error } = await supabase
      .from("paiements_abonnement")
      .insert({
        business_id: business.id,
        montant: parametres?.abonnement_prix || 0,
        statut: "en_attente",
        justificatif_url: url,
      })
      .select()
      .single();
    if (error) {
      setUploadMsg(t("paiement.submitError", { message: error.message }));
      return;
    }
    setHistorique((prev) => [data, ...prev]);
    setUploadMsg(t("paiement.submitSuccess"));

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
  const enAttente = dernierPaiement?.statut === "en_attente";
  const rejete = dernierPaiement?.statut === "echoue";

  return (
    <div>
      {enAttente && (
        <div className="sb-badge sb-badge-amber" style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
          {t("paiement.statutEnAttente")}
        </div>
      )}
      {!enAttente && rejete && (
        <div className="sb-badge sb-badge-coral" style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
          {t("paiement.statutRejete")}
          {dernierPaiement.raison_rejet && (
            <div style={{ marginTop: 4, fontWeight: 400 }}>
              {t("paiement.raisonRejetLabel")} {dernierPaiement.raison_rejet}
            </div>
          )}
        </div>
      )}
      {uploadMsg && (
        <div className="sb-badge sb-badge-emerald" style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
          {uploadMsg}
        </div>
      )}

      <div className="sb-paiement-info">
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 8px" }}>
          {t("paiement.montantAPayer")} <strong style={{ color: "var(--ink)" }}>{fmt(parametres?.abonnement_prix)}</strong>
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
          label={t("paiement.uploadLabel")}
          businessId={business.id}
          folder="justificatifs-paiement"
          value=""
          onChange={soumettreJustificatif}
        />
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
