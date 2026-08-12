"use client";

import { useEffect, useState } from "react";
import { Sparkles, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { t as tBase } from "@/lib/i18n";
import { dernierPaiementRejete } from "@/lib/paiements";
import FormuleEtPaiement from "@/components/FormuleEtPaiement";
import ConfirmDialog from "@/components/ConfirmDialog";

// Écran affiché à la toute première échéance de paiement (essai gratuit
// de 7 jours terminé, jamais encore payé — subscription_status =
// 'en_attente_paiement'). Distinct de Reabonnement.js (abonnement déjà
// payé au moins une fois, puis expiré) : jamais le même texte entre les
// deux, même s'ils partagent le même bloc choix de formule + paiement
// (components/FormuleEtPaiement.js). 'en_attente_paiement' peut aussi
// venir du rejet d'un justificatif envoyé pendant l'essai (voir
// admin_reject_payment) — même statut que la fin d'essai classique, donc
// distingué ici via le dernier paiement plutôt que via le statut, pour un
// message encore différent des deux autres (ni accueil, ni réabonnement).
export default function PremierPaiement({ business }) {
  const { refreshBusiness, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [rejete, setRejete] = useState(false);
  const t = (key, vars) => tBase(business?.langue, key, vars);

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    dernierPaiementRejete(business.id).then((r) => {
      if (active) setRejete(r);
    });
    return () => {
      active = false;
    };
  }, [business?.id]);

  async function handleRefresh() {
    setChecking(true);
    await refreshBusiness();
    setChecking(false);
  }

  return (
    <div className="sb-pending-screen">
      <div className="sb-pending-card" style={{ maxWidth: 720, textAlign: "left" }}>
        <div className="sb-pending-icon" style={{ margin: "0 auto 16px" }}>
          <Sparkles size={24} />
        </div>
        <h1 className="sb-h1" style={{ textAlign: "center", marginBottom: 8 }}>
          {rejete ? t("paiementRejete.title") : t("premierPaiement.title")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", margin: "0 auto 24px", maxWidth: 480 }}>
          {rejete ? t("paiementRejete.text") : t("premierPaiement.text")}
        </p>

        <FormuleEtPaiement business={business} activeLabel={t("premierPaiement.formuleActuelleLabel")} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
          <button className="sb-btn sb-btn-primary" style={{ justifyContent: "center" }} onClick={handleRefresh} disabled={checking}>
            <RefreshCw size={14} /> {checking ? t("pending.checking") : t("pending.checkStatus")}
          </button>
          <button className="sb-btn sb-btn-ghost" style={{ justifyContent: "center" }} onClick={() => setConfirmLogout(true)}>
            <LogOut size={14} /> {t("pending.logout")}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmLogout}
        title={t("common.confirmLogoutTitle")}
        message={t("common.confirmLogoutMessage")}
        confirmLabel={t("common.confirmLogoutYes")}
        cancelLabel={t("common.confirmLogoutCancel")}
        onConfirm={() => {
          setConfirmLogout(false);
          signOut();
        }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
