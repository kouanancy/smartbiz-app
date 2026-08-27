"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { t as tBase } from "@/lib/i18n";

// Rolling en mois plutôt que calé sur le calendrier (même principe que
// PERIODE_MOIS dans app/(app)/tresorerie/page.js) — mais seulement 3
// options ici (mois/trimestre/année, jamais semestre) : demande explicite,
// distincte du sélecteur à 4 options de Trésorerie.
const PERIODE_MOIS = { mois: 1, trimestre: 3, annee: 12 };

export default function StatistiquesPage() {
  const { business } = useAuth();
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState("mois");

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      setLoading(true);
      // Uniquement les commandes livrées, comme partout ailleurs dans
      // l'app (dashboard, trésorerie) — une commande en attente ou
      // annulée n'a jamais réellement "vendu" les articles qu'elle
      // contient. Même idiome de jointure que
      // app/(app)/articles/[id]/page.js (commande_lignes ->
      // commandes!inner(...)). offert = false : un cadeau n'est jamais
      // une vente, il ne doit donc jamais gonfler ce classement (voir
      // supabase-articles-offerts-migration.sql).
      const { data } = await supabase
        .from("commande_lignes")
        .select("quantite, articles(nom), commandes!inner(business_id, statut, created_at)")
        .eq("commandes.business_id", business.id)
        .eq("commandes.statut", "livree")
        .eq("offert", false);
      if (!active) return;
      setLignes(data || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  const classement = useMemo(() => {
    const moisBack = PERIODE_MOIS[periode];
    const depuis = new Date();
    depuis.setMonth(depuis.getMonth() - moisBack);
    const parArticle = new Map();
    lignes.forEach((ligne) => {
      const createdAt = ligne.commandes?.created_at;
      const nom = ligne.articles?.nom;
      if (!createdAt || !nom || new Date(createdAt) < depuis) return;
      parArticle.set(nom, (parArticle.get(nom) || 0) + ligne.quantite);
    });
    return [...parArticle.entries()].sort((a, b) => b[1] - a[1]);
  }, [lignes, periode]);

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  return (
    <div>
      <h1 className="sb-h1">{t("statistiques.title")}</h1>
      <p className="sb-sub">{t("statistiques.subtitle")}</p>

      <div className="sb-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="sb-section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingUp size={16} /> {t("statistiques.topVentesTitle")}
          </div>
          <div className="sb-toggle-group">
            {["mois", "trimestre", "annee"].map((key) => (
              <button
                key={key}
                className={`sb-toggle-item${periode === key ? " active" : ""}`}
                onClick={() => setPeriode(key)}
              >
                {t(`statistiques.periode.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {classement.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("statistiques.aucuneVente")}</p>
        ) : (
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("statistiques.colRang")}</th>
                  <th>{t("statistiques.colArticle")}</th>
                  <th>{t("statistiques.colQuantite")}</th>
                </tr>
              </thead>
              <tbody>
                {classement.map(([nom, quantite], i) => (
                  <tr key={nom}>
                    <td className="sb-mono">{i + 1}</td>
                    <td>{nom}</td>
                    <td className="sb-mono">{quantite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
