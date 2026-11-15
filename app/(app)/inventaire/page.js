"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Plus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { dateLocale } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { PAGE_SIZE } from "@/lib/constants";
import Pagination from "@/components/Pagination";

const STATUT_BADGE_CLASS = { brouillon: "sb-badge-amber", valide: "sb-badge-emerald" };

export default function InventairePage() {
  const { business } = useAuth();
  const router = useRouter();
  const t = (key, vars) => tBase(business?.langue, key, vars);

  const [inventaires, setInventaires] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);

  const [ouvrirChoixOuvert, setOuvrirChoixOuvert] = useState(false);
  const [perimetre, setPerimetre] = useState("toutes");
  const [categoriesChoisies, setCategoriesChoisies] = useState([]);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [erreurCreation, setErreurCreation] = useState("");

  useEffect(() => {
    if (business && !business.module_achats_actif) router.replace("/articles");
  }, [business, router]);

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      const [{ data, count }, categoriesRes] = await Promise.all([
        supabase
          .from("inventaires")
          .select("*, inventaire_lignes(quantite_comptee, ecart)", { count: "exact" })
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
        supabase.from("categories").select("*").eq("business_id", business.id).order("nom"),
      ]);
      if (!active) return;
      setInventaires(data || []);
      setTotalCount(count || 0);
      setCategories(categoriesRes.data || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id, page]);

  const brouillonExistant = inventaires.find((i) => i.statut === "brouillon");

  function ouvrirCreation() {
    setPerimetre("toutes");
    setCategoriesChoisies([]);
    setErreurCreation("");
    setOuvrirChoixOuvert(true);
  }

  function toggleCategorie(id) {
    setCategoriesChoisies((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function creerInventaire() {
    if (perimetre === "categories" && categoriesChoisies.length === 0) {
      setErreurCreation(t("inventaire.choisirCategorieError"));
      return;
    }
    setCreationEnCours(true);
    setErreurCreation("");
    const { data, error } = await supabase
      .rpc("creer_inventaire", { p_categorie_ids: perimetre === "toutes" ? null : categoriesChoisies })
      .single();
    if (error || !data) {
      setErreurCreation(error?.message || t("inventaire.creationError"));
      setCreationEnCours(false);
      return;
    }
    router.push(`/inventaire/${data.id}`);
  }

  function libellePerimetre(inv) {
    if (!inv.perimetre_categorie_ids || inv.perimetre_categorie_ids.length === 0) return t("inventaire.perimetreToutes");
    const noms = inv.perimetre_categorie_ids.map((id) => categories.find((c) => c.id === id)?.nom).filter(Boolean);
    return noms.join(", ") || t("inventaire.perimetreToutes");
  }

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <button className="sb-back-link" onClick={() => router.push("/stock")}>
        <ArrowLeft size={15} /> {t("stock.backToLanding")}
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="sb-h1">{t("inventaire.title")}</h1>
          <p className="sb-sub">{t("inventaire.subtitleCount", { n: totalCount })}</p>
        </div>
        {brouillonExistant ? (
          <button className="sb-btn sb-btn-primary" onClick={() => router.push(`/inventaire/${brouillonExistant.id}`)}>
            {t("inventaire.reprendreBrouillon", { numero: brouillonExistant.numero })}
          </button>
        ) : (
          <button className="sb-btn sb-btn-primary" onClick={ouvrirCreation}>
            <Plus size={14} /> {t("inventaire.nouvelInventaire")}
          </button>
        )}
      </div>

      <div className="sb-card" style={{ marginTop: 14 }}>
        {inventaires.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("inventaire.aucunInventaire")}</p>
        ) : (
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("dashboard.colNumero")}</th>
                  <th>{t("dashboard.colDate")}</th>
                  <th>{t("inventaire.colPerimetre")}</th>
                  <th style={{ textAlign: "right" }}>{t("inventaire.colNbComptes")}</th>
                  <th style={{ textAlign: "right" }}>{t("inventaire.colNbEcarts")}</th>
                  <th>{t("commandes.colStatut")}</th>
                </tr>
              </thead>
              <tbody>
                {inventaires.map((inv) => {
                  const lignes = inv.inventaire_lignes || [];
                  const nbComptes = lignes.filter((l) => l.quantite_comptee !== null).length;
                  const nbEcarts = lignes.filter((l) => l.ecart !== null && l.ecart !== 0).length;
                  return (
                    <tr key={inv.id} className="sb-row-clickable" onClick={() => router.push(`/inventaire/${inv.id}`)}>
                      <td className="sb-mono">{inv.numero}</td>
                      <td>{new Date(inv.date_inventaire).toLocaleDateString(dateLocale(business?.langue))}</td>
                      <td className="sb-nom-tronque">{libellePerimetre(inv)}</td>
                      <td className="sb-mono" style={{ textAlign: "right" }}>{nbComptes}</td>
                      <td className="sb-mono" style={{ textAlign: "right" }}>{inv.statut === "valide" ? nbEcarts : "—"}</td>
                      <td>
                        <span className={`sb-badge ${STATUT_BADGE_CLASS[inv.statut] || "sb-badge-amber"}`}>
                          {t(`inventaire.statut.${inv.statut}`)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} label={t("common.pageSur", { page: page + 1, total: totalPages })} />
      </div>

      {ouvrirChoixOuvert && (
        <div className="sb-modal-overlay" onClick={() => setOuvrirChoixOuvert(false)}>
          <div className="sb-card" style={{ width: 380, background: "var(--card)" }} onClick={(e) => e.stopPropagation()}>
            <div className="sb-section-title">{t("inventaire.nouvelInventaireModalTitle")}</div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 14px" }}>{t("inventaire.nouvelInventaireModalSub")}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                <input type="radio" checked={perimetre === "toutes"} onChange={() => setPerimetre("toutes")} />
                {t("inventaire.perimetreToutes")}
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                <input type="radio" checked={perimetre === "categories"} onChange={() => setPerimetre("categories")} />
                {t("inventaire.perimetreCategories")}
              </label>

              {perimetre === "categories" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 24 }}>
                  {categories.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: "var(--muted)" }}>{t("inventaire.aucuneCategorie")}</p>
                  ) : (
                    categories.map((c) => (
                      <label
                        key={c.id}
                        className={`sb-badge ${categoriesChoisies.includes(c.id) ? "sb-badge-emerald" : ""}`}
                        style={{ cursor: "pointer", border: categoriesChoisies.includes(c.id) ? undefined : "1px solid var(--line)" }}
                      >
                        <input
                          type="checkbox"
                          checked={categoriesChoisies.includes(c.id)}
                          onChange={() => toggleCategorie(c.id)}
                          style={{ display: "none" }}
                        />
                        {c.nom}
                      </label>
                    ))
                  )}
                </div>
              )}

              {erreurCreation && <p style={{ fontSize: 12, color: "var(--coral)", margin: 0 }}>{erreurCreation}</p>}
              <button className="sb-btn sb-btn-emerald" style={{ justifyContent: "center" }} onClick={creerInventaire} disabled={creationEnCours}>
                <CheckCircle2 size={14} /> {creationEnCours ? t("inventaire.creationEnCours") : t("inventaire.confirmerCreation")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
