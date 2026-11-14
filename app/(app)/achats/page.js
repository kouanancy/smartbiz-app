"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";

const STATUT_BADGE_CLASS = {
  brouillon: "sb-badge-amber",
  validee: "sb-badge-emerald",
  annulee: "sb-badge-coral",
};

// Total affiché dans l'historique : pour une réception déjà validée,
// frais_repartis porte le montant réel appliqué à chaque ligne (groupé ou
// non) -- pour un brouillon, pas encore calculé par valider_reception()
// (supabase-achats-approvisionnement-migration.sql), donc estimé ici à
// partir de frais_total (groupé) ou de la somme des frais_annexes saisis
// ligne par ligne (non groupé).
function totalReception(r) {
  const achats = (r.reception_lignes || []).reduce((s, l) => s + l.quantite * l.cout_unitaire, 0);
  if (r.statut === "brouillon") {
    const frais = r.frais_groupes ? r.frais_total : (r.reception_lignes || []).reduce((s, l) => s + (l.frais_annexes || 0), 0);
    return achats + frais;
  }
  return achats + (r.reception_lignes || []).reduce((s, l) => s + (l.frais_repartis || 0), 0);
}

export default function AchatsPage() {
  const { business } = useAuth();
  const router = useRouter();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);

  const [receptions, setReceptions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (business && !business.module_achats_actif) router.replace("/articles");
  }, [business, router]);

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      const { data, count } = await supabase
        .from("receptions")
        .select("*, reception_lignes(quantite, cout_unitaire, frais_repartis, frais_annexes)", { count: "exact" })
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (!active) return;
      setReceptions(data || []);
      setTotalCount(count || 0);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id, page]);

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push("/stock")}>
        <ArrowLeft size={15} /> {t("stock.backToLanding")}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="sb-h1">{t("achats.title")}</h1>
          <p className="sb-sub">{t("achats.subtitleCount", { n: totalCount })}</p>
        </div>
        <button className="sb-btn sb-btn-primary" onClick={() => router.push("/achats/nouvelle")}>
          <Plus size={14} /> {t("achats.nouvelleReception")}
        </button>
      </div>

      <div className="sb-card" style={{ marginTop: 14 }}>
        {receptions.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("achats.aucuneReception")}</p>
        ) : (
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("dashboard.colNumero")}</th>
                  <th>{t("dashboard.colDate")}</th>
                  <th>{t("achats.colFournisseur")}</th>
                  <th>{t("achats.colNbArticles")}</th>
                  <th>{t("achats.colTotal")}</th>
                  <th>{t("commandes.colStatut")}</th>
                </tr>
              </thead>
              <tbody>
                {receptions.map((r) => (
                  <tr
                    key={r.id}
                    className="sb-row-clickable"
                    onClick={() => router.push(`/achats/${r.id}`)}
                    style={r.statut === "annulee" ? { opacity: 0.55 } : undefined}
                  >
                    <td className="sb-mono">{r.numero}</td>
                    <td>{new Date(r.date_reception).toLocaleDateString(dateLocale(business?.langue))}</td>
                    <td>{r.fournisseur || "—"}</td>
                    <td className="sb-mono">{(r.reception_lignes || []).length}</td>
                    <td className="sb-mono">{fmt(totalReception(r))}</td>
                    <td>
                      <span className={`sb-badge ${STATUT_BADGE_CLASS[r.statut] || "sb-badge-amber"}`}>
                        {t(`achats.statut.${r.statut}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} label={t("common.pageSur", { page: page + 1, total: totalPages })} />
      </div>
    </div>
  );
}
