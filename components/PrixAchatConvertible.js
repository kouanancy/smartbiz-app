"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { fmt as fmtBase } from "@/lib/format";
import { DEVISES_TAUX_CHANGE } from "@/lib/constants";

// Champ Prix d'achat (toujours en FCFA, voir supabase-taux-change-
// migration.sql) avec convertisseur intégré, réutilisé par les 3
// formulaires qui saisissent ce montant : Nouvel article et Modifier
// l'article (app/(app)/articles/page.js, app/(app)/articles/[id]/page.js)
// et Réapprovisionner (app/(app)/articles/[id]/page.js). Le montant payé
// et le taux saisis pour une conversion ne sont jamais conservés en base
// — seul le résultat en FCFA compte pour les calculs de marge, donc le
// panneau de conversion n'existe que côté client, réinitialisé à chaque
// ouverture.
export default function PrixAchatConvertible({ t, label, placeholder, value, onValueChange, tauxDefaut, deviseDefaut }) {
  const [ouvert, setOuvert] = useState(false);
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState(deviseDefaut || "USD");
  const [taux, setTaux] = useState(tauxDefaut ? String(tauxDefaut) : "");

  function ouvrir() {
    setMontant("");
    setDevise(deviseDefaut || "USD");
    setTaux(tauxDefaut ? String(tauxDefaut) : "");
    setOuvert(true);
  }

  const resultat = (Number(montant) || 0) * (Number(taux) || 0);
  const peutAppliquer = Number(montant) > 0 && Number(taux) > 0;

  function appliquer() {
    if (!peutAppliquer) return;
    onValueChange(String(Math.round(resultat)));
    setOuvert(false);
  }

  return (
    <div className="sb-field">
      <label>{label}</label>
      <input className="sb-input" placeholder={placeholder} type="number" value={value} onChange={(e) => onValueChange(e.target.value)} />
      <button type="button" className="sb-convert-toggle" onClick={() => (ouvert ? setOuvert(false) : ouvrir())}>
        <ArrowLeftRight size={11} /> {t("articles.convertirDevise")}
      </button>

      {ouvert && (
        <div className="sb-convert-panel">
          <div style={{ display: "flex", gap: 8 }}>
            <div className="sb-field" style={{ flex: 1 }}>
              <label>{t("articles.convertMontantLabel")}</label>
              <input className="sb-input" type="number" min={0} placeholder="0" value={montant} onChange={(e) => setMontant(e.target.value)} />
            </div>
            <div className="sb-field" style={{ width: 84 }}>
              <label>{t("articles.convertDeviseLabel")}</label>
              <select className="sb-input" value={devise} onChange={(e) => setDevise(e.target.value)}>
                {DEVISES_TAUX_CHANGE.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="sb-field">
            <label>{t("articles.convertTauxLabel")}</label>
            <input className="sb-input" type="number" min={0} step="0.01" value={taux} onChange={(e) => setTaux(e.target.value)} />
          </div>
          <p className="sb-convert-resultat">
            {t("articles.convertEquivaut")} <strong className="sb-mono">{fmtBase(resultat, "FCFA")}</strong>
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="sb-btn sb-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setOuvert(false)}>
              {t("articles.convertAnnuler")}
            </button>
            <button
              type="button"
              className="sb-btn sb-btn-emerald"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={appliquer}
              disabled={!peutAppliquer}
            >
              {t("articles.convertAppliquer")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
