"use client";

import { useState } from "react";
import { Clock, RefreshCw, LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthProvider";
import { t as tBase } from "@/lib/i18n";
import PaiementAbonnement from "@/components/PaiementAbonnement";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function PendingSubscription({ business }) {
  const { refreshBusiness, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const t = (key, vars) => tBase(business?.langue, key, vars);

  const status = business?.subscription_status || "en_attente_paiement";
  const isExpired = status === "expire";
  const isSuspended = status === "suspendu";
  // Un compte "suspendu" ne l'est pas forcément pour une question de
  // paiement — pas de flux de paiement sur cet écran-là.
  const montrerPaiement = !isSuspended;

  async function handleRefresh() {
    setChecking(true);
    await refreshBusiness();
    setChecking(false);
  }

  return (
    <div className="sb-pending-screen">
      <div className="sb-pending-card">
        <div className="sb-pending-icon">
          <Clock size={24} />
        </div>
        <h1 className="sb-h1" style={{ marginBottom: 8 }}>
          {isExpired ? t("pending.titleExpired") : isSuspended ? t("pending.titleSuspended") : t("pending.titleDefault")}
        </h1>
        <p className="sb-sub" style={{ marginBottom: 4 }}>
          {t("pending.statusLine", {
            name: business?.name || t("pending.defaultBusinessName"),
            status: t(`common.subscriptionStatus.${status}`),
          })}
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "12px 0 22px" }}>
          {isExpired ? t("pending.textExpired") : t("pending.textDefault")}
        </p>
        {montrerPaiement && (
          <div style={{ textAlign: "left", marginBottom: 20 }}>
            <PaiementAbonnement business={business} />
          </div>
        )}
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
