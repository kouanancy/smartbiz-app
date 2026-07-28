"use client";

import { useEffect, useState } from "react";
import { Copy, Printer, Share2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt } from "@/lib/format";
import { THEMES, SANS_CATEGORIE } from "@/lib/constants";

export default function CataloguePage() {
  const { business } = useAuth();
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreCategorie, setFiltreCategorie] = useState("Toutes");
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
    filtreCategorie === "Toutes"
      ? disponibles
      : disponibles.filter((a) => (a.categories?.nom ?? SANS_CATEGORIE) === filtreCategorie);

  function buildTexte() {
    const titre = `🛍️ Catalogue — ${business?.name || "SmartBiz"}`;
    const lignes = filtres.map((a) => `• ${a.nom} — ${fmt(a.prix_vente)}`).join("\n");
    return `${titre}\n\n${lignes}\n\nCommande par WhatsApp !`;
  }

  async function copierTexte() {
    try {
      await navigator.clipboard.writeText(buildTexte());
      setCopyMsg("✅ Texte copié — colle-le dans ta bio ou légende Instagram");
    } catch {
      setCopyMsg("Impossible de copier automatiquement, sélectionne le texte manuellement.");
    }
  }

  function partagerWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildTexte())}`, "_blank");
  }

  if (loading) return <p className="sb-sub">Chargement…</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="sb-h1">Catalogue</h1>
          <p className="sb-sub">{disponibles.length} article(s) disponible(s) à partager</p>
        </div>
        <div className="sb-no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="sb-btn sb-btn-ghost" onClick={copierTexte}>
            <Copy size={13} /> Copier le texte
          </button>
          <button className="sb-btn" style={{ background: "#25D366", color: "#fff" }} onClick={partagerWhatsApp}>
            <Share2 size={13} /> Partager
          </button>
          <button className="sb-btn sb-btn-primary" onClick={() => window.print()}>
            <Printer size={13} /> Imprimer / PDF
          </button>
        </div>
      </div>

      {copyMsg && (
        <div className="sb-badge sb-badge-emerald sb-no-print" style={{ margin: "12px 0", fontSize: 12.5, padding: "6px 10px" }}>
          {copyMsg}
        </div>
      )}

      <div className="sb-toggle-group sb-no-print" style={{ margin: "14px 0", flexWrap: "wrap", display: "inline-flex" }}>
        {["Toutes", SANS_CATEGORIE, ...categories.map((c) => c.nom)].map((c) => (
          <button key={c} className={`sb-toggle-item${filtreCategorie === c ? " active" : ""}`} onClick={() => setFiltreCategorie(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="sb-catalogue-header">
        {business?.logo_url ? (
          <img src={business.logo_url} alt={business?.name || "Logo"} />
        ) : (
          <div className="sb-catalogue-logo-fallback" style={{ background: accent }}>
            {(business?.name || "SB").slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <div className="sb-display" style={{ fontWeight: 700, fontSize: 16 }}>
            {business?.name || "Ma boutique"}
          </div>
          <div style={{ fontSize: 11.5, color: "#8A8682" }}>Catalogue des produits disponibles</div>
        </div>
      </div>

      {filtres.length === 0 ? (
        <p style={{ fontSize: 13, color: "#6B6A63", marginTop: 16 }}>Aucun article disponible dans cette catégorie pour le moment.</p>
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
              <div className="sb-catalogue-cat">{a.categories?.nom ?? SANS_CATEGORIE}</div>
              <div className="sb-catalogue-nom">{a.nom}</div>
              <div className="sb-catalogue-prix">{fmt(a.prix_vente)}</div>
            </div>
          ))}
        </div>
      )}

      <p className="sb-no-print" style={{ fontSize: 11, color: "#8A8682", marginTop: 16 }}>
        Instagram ne permet pas d&apos;envoi automatique depuis le navigateur — utilise « Copier le texte » puis colle-le dans ta bio, ta story ou ta légende de publication.
      </p>
    </div>
  );
}
