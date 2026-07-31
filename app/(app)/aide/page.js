"use client";

import { useEffect, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { toWhatsAppNumber } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";

const SUPPORT_EMAIL = "contact@doka.ci";

export default function AidePage() {
  const { business } = useAuth();
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [supportTelephone, setSupportTelephone] = useState("");

  // Numéro dédié au support (parametres_globaux.support_telephone,
  // lecture publique), indépendant du numéro Wave des paiements — les
  // deux rôles n'ont aucune raison de partager le même numéro.
  useEffect(() => {
    supabase
      .from("parametres_globaux")
      .select("support_telephone")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setSupportTelephone(data?.support_telephone || ""));
  }, []);

  const numeroWhatsApp = toWhatsAppNumber(supportTelephone);

  function contacterWhatsApp() {
    const message = t("aide.whatsappMessage", { businessName: business?.name || t("common.defaultBusinessName") });
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <div>
      <h1 className="sb-h1">{t("aide.title")}</h1>
      <p className="sb-sub">{t("aide.subtitle")}</p>

      <div className="sb-card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageCircle size={15} /> {t("aide.whatsappTitle")}
        </div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>{t("aide.whatsappSub")}</p>
        {numeroWhatsApp ? (
          <button className="sb-btn" style={{ background: "#25D366", color: "#fff" }} onClick={contacterWhatsApp}>
            <MessageCircle size={14} /> {t("aide.whatsappBtn")}
          </button>
        ) : (
          <p style={{ fontSize: 12.5, color: "#8A8682" }}>{t("aide.whatsappUnavailable")}</p>
        )}
      </div>

      <div className="sb-card" style={{ maxWidth: 480 }}>
        <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mail size={15} /> {t("aide.emailTitle")}
        </div>
        <p style={{ fontSize: 12.5, color: "#6E6B68", margin: "0 0 12px" }}>{t("aide.emailSub")}</p>
        <p className="sb-mono" style={{ fontSize: 13, marginBottom: 12 }}>
          {SUPPORT_EMAIL}
        </p>
        <a className="sb-btn sb-btn-ghost" href={`mailto:${SUPPORT_EMAIL}`}>
          <Mail size={14} /> {t("aide.emailBtn")}
        </a>
      </div>
    </div>
  );
}
