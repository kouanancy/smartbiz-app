"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { PLAN_PRICES } from "@/lib/constants";
import PlanGrid from "@/components/PlanGrid";
import PaiementAbonnement from "@/components/PaiementAbonnement";

// Parcours à trois étapes (liste des formules -> détail de la formule
// choisie -> paiement), avec un bouton retour à chaque étape — jamais
// accessible à un compte administrateur (voir la redirection ci-dessous,
// même garde que la carte Abonnement retirée de Paramètres pour ce cas).
export default function ChangerFormulePage() {
  const { business, setBusiness } = useAuth();
  const router = useRouter();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [etape, setEtape] = useState("liste"); // 'liste' | 'detail' | 'paiement'
  const [formuleChoisie, setFormuleChoisie] = useState(null);

  useEffect(() => {
    if (business?.is_admin) router.replace("/parametres");
  }, [business?.is_admin, router]);

  if (business?.is_admin) return null;

  const planActuel = business?.plan || "autonome";

  async function confirmerFormule() {
    if (formuleChoisie !== planActuel) {
      const { data, error } = await supabase.from("businesses").update({ plan: formuleChoisie }).eq("id", business.id).select().single();
      if (!error && data) setBusiness(data);
    }
    setEtape("paiement");
  }

  return (
    <div className="sb-formule-screen">
      <div className="sb-formule-inner">
        <button
          className="sb-back-link"
          onClick={() => (etape === "liste" ? router.push("/parametres") : setEtape(etape === "paiement" ? "detail" : "liste"))}
        >
          <ArrowLeft size={15} /> {etape === "liste" ? t("parametres.detailBackToSettings") : t("parametres.formuleEtapePrecedente")}
        </button>

        <h1 className="sb-h1">{t("parametres.formuleTitle")}</h1>
        <p className="sb-sub">{t("parametres.formuleSub")}</p>

        {etape === "liste" && (
          <PlanGrid
            t={t}
            fmt={fmt}
            planActuel={planActuel}
            disableActive={true}
            activeLabel={t("parametres.formuleActive")}
            chooseLabel={t("parametres.formuleChoisir")}
            onChoose={(key) => {
              setFormuleChoisie(key);
              setEtape("detail");
            }}
          />
        )}

        {etape === "detail" && formuleChoisie && (
          <div className="sb-card" style={{ maxWidth: 420 }}>
            <div className="sb-section-title" style={{ fontSize: 18 }}>
              {t(`common.plans.${formuleChoisie}.nom`)}
            </div>
            <div className="sb-plan-card-price" style={{ margin: "8px 0" }}>
              {fmt(PLAN_PRICES[formuleChoisie].mensuel)}
              <span>{t("parametres.formulePrixSuffixe")}</span>
            </div>
            {PLAN_PRICES[formuleChoisie].installation && (
              <p className="sb-plan-card-installation" style={{ marginBottom: 8 }}>
                {t("parametres.formuleInstallation", { montant: fmt(PLAN_PRICES[formuleChoisie].installation) })}
              </p>
            )}
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>{t(`common.plans.${formuleChoisie}.description`)}</p>
            <ul className="sb-plan-card-avantages sb-plan-card-avantages-icons" style={{ marginBottom: 16 }}>
              {t(`common.plans.${formuleChoisie}.avantages`).map((a) => (
                <li key={a}>
                  <Check size={13} /> {a}
                </li>
              ))}
            </ul>
            <button className="sb-btn sb-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={confirmerFormule}>
              {t("parametres.formuleContinuerPaiement")}
            </button>
          </div>
        )}

        {etape === "paiement" && (formuleChoisie || planActuel) && business?.id && (
          <div className="sb-card" style={{ maxWidth: 420 }}>
            <div className="sb-section-title" style={{ marginBottom: 4 }}>
              {t(`common.plans.${formuleChoisie || planActuel}.nom`)}
            </div>
            <PaiementAbonnement business={business} plan={formuleChoisie || planActuel} />
          </div>
        )}
      </div>
    </div>
  );
}
