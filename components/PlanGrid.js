"use client";

import { Check } from "lucide-react";
import { PLANS, PLAN_PRICES, PLANS_INDISPONIBLES } from "@/lib/constants";

// Grille des 3 formules façon page tarifaire, réutilisée partout où un
// commerçant choisit/change de formule : Paramètres > Changer ma formule,
// premier paiement (fin d'essai), réabonnement (abonnement expiré) et le
// site vitrine (components/LandingPage.js). disableActive=true désactive
// le bouton de la formule déjà active (rien à faire — cas "changer de
// formule" dans Paramètres) ; disableActive=false laisse les trois
// formules cliquables, y compris l'actuelle, puisqu'un premier paiement ou
// un réabonnement doit aboutir à un paiement quelle que soit la formule
// choisie, même si c'est la même qu'avant.
//
// PLANS_INDISPONIBLES (lib/constants.js) grise une formule et empêche sa
// sélection, sauf si elle est déjà la formule active de la boutique — une
// cliente déjà en Premium géré doit rester capable de payer/renouveler
// cette même formule, seule une NOUVELLE sélection est bloquée.
export default function PlanGrid({ t, fmt, planActuel, onChoose, disableActive = false, activeLabel, chooseLabel }) {
  return (
    <div className="sb-plan-grid">
      {PLANS.map((key) => {
        const active = key === planActuel;
        const indisponible = PLANS_INDISPONIBLES.includes(key) && !active;
        const desactive = (active && disableActive) || indisponible;
        return (
          <div className={`sb-plan-card${active ? " sb-plan-card-active" : ""}${indisponible ? " sb-plan-card-indisponible" : ""}`} key={key}>
            {active && <span className="sb-plan-card-badge sb-badge sb-badge-emerald">{activeLabel}</span>}
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
            <ul className="sb-plan-card-avantages sb-plan-card-avantages-icons">
              {t(`common.plans.${key}.avantages`).map((a) => (
                <li key={a}>
                  <Check size={13} /> {a}
                </li>
              ))}
            </ul>
            <button className={`sb-btn ${desactive ? "sb-btn-ghost" : "sb-btn-primary"} sb-plan-card-btn`} disabled={desactive} onClick={() => onChoose(key)}>
              {indisponible ? t("parametres.formuleIndisponible") : active && disableActive ? activeLabel : chooseLabel}
            </button>
          </div>
        );
      })}
    </div>
  );
}
