"use client";

import { useState } from "react";
import { ShieldOff, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { t as tBase } from "@/lib/i18n";
import ConfirmDialog from "@/components/ConfirmDialog";

// Compte suspendu par l'équipe Doka — pas forcément lié à un problème de
// paiement, donc aucun flux de paiement ici (contrairement à
// PremierPaiement.js et Reabonnement.js).
export default function CompteSuspendu({ business }) {
  const { refreshBusiness, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const t = (key, vars) => tBase(business?.langue, key, vars);

  async function handleRefresh() {
    setChecking(true);
    await refreshBusiness();
    setChecking(false);
  }

  return (
    <div className="sb-pending-screen">
      <div className="sb-pending-card">
        <div className="sb-pending-icon">
          <ShieldOff size={24} />
        </div>
        <h1 className="sb-h1" style={{ marginBottom: 8 }}>
          {t("pending.titleSuspended")}
        </h1>
        <p className="sb-sub" style={{ marginBottom: 4 }}>
          {t("pending.statusLine", {
            name: business?.name || t("pending.defaultBusinessName"),
            status: t(`common.subscriptionStatus.${business?.subscription_status}`),
          })}
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 22px" }}>{t("pending.textSuspended")}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
