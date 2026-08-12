"use client";

import { useState } from "react";
import { Clock, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { t as tBase } from "@/lib/i18n";
import FormuleEtPaiement from "@/components/FormuleEtPaiement";
import ConfirmDialog from "@/components/ConfirmDialog";

// Écran de réabonnement (abonnement déjà payé au moins une fois, puis
// expiré — subscription_status = 'expire'). Distinct de PremierPaiement.js
// (tout premier paiement, jamais encore payé) : jamais le même texte
// entre les deux, même s'ils partagent le même bloc choix de formule +
// paiement (components/FormuleEtPaiement.js). Un seul bouton de
// confirmation dans tout le parcours : celui d'envoi du justificatif,
// dans FormuleEtPaiement/PaiementAbonnement — pas de bouton "vérifier mon
// statut" séparé, qui faisait doublon depuis la mise en place du vrai
// circuit de justificatif. 'expire' peut aussi venir du rejet d'un
// justificatif de renouvellement anticipé envoyé pendant que le compte
// était encore actif (voir admin_reject_payment) — même statut qu'une
// expiration classique, donc distingué ici via paiementRejete (calculé
// dans AuthProvider à partir du dernier paiement en date, pas via le
// statut) plutôt que via le statut, pour un message encore différent des
// deux autres.
export default function Reabonnement({ business, paiementRejete }) {
  const { signOut } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const t = (key, vars) => tBase(business?.langue, key, vars);

  return (
    <div className="sb-pending-screen">
      <div className="sb-pending-card" style={{ maxWidth: 720, textAlign: "left" }}>
        <div className="sb-pending-icon" style={{ margin: "0 auto 16px" }}>
          <Clock size={24} />
        </div>
        <h1 className="sb-h1" style={{ textAlign: "center", marginBottom: 8 }}>
          {paiementRejete ? t("paiementRejete.title") : t("reabonnement.title")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", margin: "0 auto 24px", maxWidth: 480 }}>
          {paiementRejete ? t("paiementRejete.text") : t("reabonnement.text")}
        </p>

        <FormuleEtPaiement business={business} activeLabel={t("reabonnement.formuleActuelleLabel")} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
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
