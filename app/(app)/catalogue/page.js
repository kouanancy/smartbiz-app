"use client";

import { useEffect, useState } from "react";
import { Copy, Printer, Share2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase } from "@/lib/format";
import { THEMES } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";

const FILTRE_TOUTES = "toutes";
const FILTRE_SANS_CATEGORIE = "sans-categorie";

export default function CataloguePage() {
  const { business } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreCategorie, setFiltreCategorie] = useState(FILTRE_TOUTES);
  const [copyMsg, setCopyMsg] = useState("");

  const accent = THEMES[business?.theme_key || "orange"].accent;

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [articlesRes, categoriesRes] = await Promise.all([
        supabase.from("articles").select("*, categories(nom)").eq("business_id", business.id).order("nom"),
        supabase.from("categories").select("*").eq("business_id", business.id).order("nom"),
      ]);
      if (!active) return;
      setArticles(articlesRes.data || []);
      setCategories(categoriesRes.data || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  const disponibles = articles.filter((a) => a.stock > 0);
  const filtres =
    filtreCategorie === FILTRE_TOUTES
      ? disponibles
      : disponibles.filter((a) =>
          filtreCategorie === FILTRE_SANS_CATEGORIE ? !a.categorie_id : a.categorie_id === filtreCategorie
        );

  const filtresCategorie = [
    { key: FILTRE_TOUTES, label: t("common.toutes") },
    { key: FILTRE_SANS_CATEGORIE, label: t("common.sansCategorie") },
    ...categories.map((c) => ({ key: c.id, label: c.nom })),
  ];

  function buildTexte() {
    const titre = t("catalogue.shareTitle", { name: business?.name || "SmartBiz" });
    const lignes = filtres.map((a) => `• ${a.nom} — ${fmt(a.prix_vente)}`).join("\n");
    return `${titre}\n\n${lignes}\n\n${t("catalogue.shareFooter")}`;
  }

  async function copierTexte() {
    try {
      await navigator.clipboard.writeText(buildTexte());
      setCopyMsg(t("catalogue.copySuccess"));
    } catch {
      setCopyMsg(t("catalogue.copyFail"));
    }
  }

  function partagerWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildTexte())}`, "_blank");
  }

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="sb-h1">{t("catalogue.title")}</h1>
          <p className="sb-sub">{t("catalogue.subtitleCount", { n: disponibles.length })}</p>
        </div>
        <div className="sb-no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="sb-btn sb-btn-ghost" onClick={copierTexte}>
            <Copy size={13} /> {t("catalogue.copierTexte")}
          </button>
          <button className="sb-btn" style={{ background: "#25D366", color: "#fff" }} onClick={partagerWhatsApp}>
            <Share2 size={13} /> {t("catalogue.partager")}
          </button>
          <button className="sb-btn sb-btn-primary" onClick={() => window.print()}>
            <Printer size={13} /> {t("catalogue.imprimerPdf")}
          </button>
        </div>
      </div>

      {copyMsg && (
        <div className="sb-badge sb-badge-emerald sb-no-print" style={{ margin: "12px 0", fontSize: 12.5, padding: "6px 10px" }}>
          {copyMsg}
        </div>
      )}

      <div className="sb-toggle-group sb-no-print" style={{ margin: "14px 0", flexWrap: "wrap", display: "inline-flex" }}>
        {filtresCategorie.map((opt) => (
          <button
            key={opt.key}
            className={`sb-toggle-item${filtreCategorie === opt.key ? " active" : ""}`}
            onClick={() => setFiltreCategorie(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="sb-catalogue-banner">
        <div className="sb-catalogue-banner-logo">
          {business?.logo_url ? (
            <img src={business.logo_url} alt={business?.name || "Logo"} />
          ) : (
            <div className="sb-catalogue-banner-logo-fallback">
              {(business?.name || "SB").slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <div className="sb-catalogue-banner-name">{business?.name || t("common.defaultBusinessName")}</div>
          <div className="sb-catalogue-banner-tagline">{t("catalogue.headerSub")}</div>
        </div>
      </div>

      {filtres.length === 0 ? (
        <p style={{ fontSize: 13, color: "#6B6A63", marginTop: 16 }}>{t("catalogue.aucunArticle")}</p>
      ) : (
        <div className="sb-catalogue-grid">
          {filtres.map((a) => (
            <div key={a.id} className="sb-catalogue-card">
              {a.image_url ? (
                <div className="sb-catalogue-thumb-img">
                  <img src={a.image_url} alt={a.nom} />
                </div>
              ) : (
                <div className="sb-catalogue-thumb" style={{ background: accent }}>
                  {a.nom.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="sb-catalogue-nom">{a.nom}</div>
              <div className="sb-catalogue-prix">{fmt(a.prix_vente)}</div>
            </div>
          ))}
        </div>
      )}

      <p className="sb-no-print" style={{ fontSize: 11, color: "#8A8682", marginTop: 16 }}>
        {t("catalogue.instagramNote")}
      </p>
    </div>
  );
}
