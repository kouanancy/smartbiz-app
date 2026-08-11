"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { fmt as fmtBase } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthProvider";
import PlanGrid from "@/components/PlanGrid";
import PaiementAbonnement from "@/components/PaiementAbonnement";

// Bloc partagé par PremierPaiement.js (fin d'essai, tout premier paiement)
// et Reabonnement.js (abonnement actif expiré) : choix de formule (les
// trois cliquables, y compris celle déjà en place — il faut arriver au
// paiement quelle qu'elle soit) puis écran de paiement pour la formule
// choisie. Chaque page appelante fournit son propre titre/texte d'intro
// (jamais partagés entre les deux, voir les deux composants) ; ce bloc-ci
// ne gère que la mécanique choix -> paiement, commune aux deux cas.
export default function FormuleEtPaiement({ business, activeLabel }) {
  const { setBusiness } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [formuleChoisie, setFormuleChoisie] = useState(null);
  const planActuel = business?.plan || "autonome";

  async function choisirFormule(key) {
    if (key !== planActuel) {
      const { data, error } = await supabase.from("businesses").update({ plan: key }).eq("id", business.id).select().single();
      if (!error && data) setBusiness(data);
    }
    setFormuleChoisie(key);
  }

  if (!formuleChoisie) {
    return (
      <PlanGrid
        t={t}
        fmt={fmt}
        planActuel={planActuel}
        disableActive={false}
        activeLabel={activeLabel}
        chooseLabel={t("parametres.formuleChoisir")}
        onChoose={choisirFormule}
      />
    );
  }

  return (
    <div style={{ textAlign: "left" }}>
      <button className="sb-back-link" onClick={() => setFormuleChoisie(null)}>
        <ArrowLeft size={15} /> {t("parametres.formuleEtapePrecedente")}
      </button>
      <PaiementAbonnement business={business} plan={formuleChoisie} />
    </div>
  );
}
