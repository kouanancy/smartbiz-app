"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import { exportToExcel, dateFichier } from "@/lib/exportExcel";
import Pagination from "@/components/Pagination";

const STATUT_BADGE_CLASS = {
  en_attente: "sb-badge-amber",
  livree: "sb-badge-emerald",
  annulee: "sb-badge-coral",
};

const COMMANDE_SELECT =
  "*, clients(nom, telephone, adresse, email), commande_lignes(id, article_id, quantite, prix_vente, prix_achat, frais_annexes, articles(nom, unite, image_url))";

export default function CommandesPage() {
  const { business } = useAuth();
  const router = useRouter();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);
  const [commandes, setCommandes] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [nbEnAttente, setNbEnAttente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState("toutes");

  // Filtre statut appliqué côté serveur — partagé entre le chargement
  // paginé et l'export Excel, qui doivent respecter le même filtre.
  const appliquerFiltreStatut = useCallback(
    (query) => (filtreStatut === "toutes" ? query : query.eq("statut", filtreStatut)),
    [filtreStatut]
  );

  // Compteur "en attente" du badge, toujours global (indépendant du filtre
  // statut affiché).
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    supabase
      .from("commandes")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("statut", "en_attente")
      .then(({ count }) => {
        if (active) setNbEnAttente(count || 0);
      });
    return () => {
      active = false;
    };
  }, [business?.id]);

  // Page courante des commandes, filtrée par statut côté serveur.
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      const { data, count } = await appliquerFiltreStatut(
        supabase.from("commandes").select(COMMANDE_SELECT, { count: "exact" }).eq("business_id", business.id)
      )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (!active) return;
      const total = count || 0;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (page > 0 && page >= totalPages) {
        setPage(totalPages - 1);
        return;
      }
      setCommandes(data || []);
      setTotalCount(total);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id, page, appliquerFiltreStatut]);

  const filtresStatut = [
    { key: "toutes", label: t("common.toutes") },
    { key: "en_attente", label: t("common.commandeStatut.en_attente") },
    { key: "livree", label: t("commandes.filterLivrees") },
  ];

  // L'export doit couvrir tout l'historique filtré, pas seulement la page
  // affichée à l'écran — nouvelle requête dédiée, sans pagination.
  async function exporterExcel() {
    const { data } = await appliquerFiltreStatut(
      supabase.from("commandes").select(COMMANDE_SELECT).eq("business_id", business.id)
    ).order("created_at", { ascending: false });
    const rows = (data || []).map((c) => ({
      [t("dashboard.colNumero")]: c.numero,
      [t("dashboard.colDate")]: new Date(c.created_at).toLocaleDateString(dateLocale(business?.langue)),
      [t("commandes.colCliente")]: c.clients?.nom ?? "—",
      [t("commandes.colArticles")]: c.commande_lignes
        .map((l) => `${l.articles?.nom ?? "—"} ×${l.quantite} ${uniteLabel(l.articles?.unite)}`)
        .join(", "),
      [t("commandes.colCa")]: c.ca,
      [t("commandes.colMargeReelle")]: c.marge,
      [t("commandes.colStatut")]: t(`common.commandeStatut.${c.statut}`) || c.statut,
    }));
    exportToExcel(`commandes-${dateFichier()}.xlsx`, "Commandes", rows);
  }

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="sb-h1">{t("commandes.title")}</h1>
          <p className="sb-sub">{t("commandes.subtitle", { n: totalCount })}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="sb-btn sb-btn-ghost" onClick={exporterExcel}>
            <FileSpreadsheet size={14} /> {t("common.exporterExcel")}
          </button>
          <span className="sb-badge sb-badge-amber" style={{ fontSize: 12.5, padding: "6px 10px" }}>
            {t("commandes.nbEnAttente", { n: nbEnAttente })}
          </span>
        </div>
      </div>

      <div className="sb-toggle-group" style={{ margin: "14px 0", flexWrap: "wrap", display: "inline-flex" }}>
        {filtresStatut.map((opt) => (
          <button
            key={opt.key}
            className={`sb-toggle-item${filtreStatut === opt.key ? " active" : ""}`}
            onClick={() => {
              setFiltreStatut(opt.key);
              setPage(0);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="sb-card">
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th>{t("dashboard.colNumero")}</th>
                <th>{t("dashboard.colDate")}</th>
                <th>{t("commandes.colCliente")}</th>
                <th>{t("commandes.colStatut")}</th>
                <th>{t("commandes.colCa")}</th>
              </tr>
            </thead>
            <tbody>
              {commandes.map((c) => (
                <tr
                  key={c.id}
                  className="sb-row-clickable"
                  onClick={() => router.push(`/commandes/${c.id}`)}
                  style={c.statut === "annulee" ? { opacity: 0.55 } : undefined}
                >
                  <td className="sb-mono">{c.numero}</td>
                  <td>{new Date(c.created_at).toLocaleDateString(dateLocale(business?.langue))}</td>
                  <td>{c.clients?.nom ?? "—"}</td>
                  <td>
                    <span className={`sb-badge ${STATUT_BADGE_CLASS[c.statut] || "sb-badge-amber"}`}>
                      {t(`common.commandeStatut.${c.statut}`) || c.statut}
                    </span>
                  </td>
                  <td className="sb-mono">{fmt(c.ca)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} label={t("common.pageSur", { page: page + 1, total: totalPages })} />
      </div>
    </div>
  );
}
