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

// 6 fiches par page à l'impression (3 colonnes × 2 lignes, voir
// .sb-catalogue-page-group dans globals.css) — un saut de page est forcé
// après chaque groupe plutôt que de laisser le moteur d'impression décider
// où couper, seule façon fiable d'empêcher une fiche produit d'être coupée
// entre deux pages (voir le commentaire détaillé dans globals.css).
const ARTICLES_PAR_PAGE_IMPRESSION = 6;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Longueur maximale (en caractères) du nom affiché sur une fiche à
// l'impression, avant troncature au milieu — voir tronquerMilieuNom
// ci-dessous. Un nombre de caractères ne prédit qu'approximativement le
// nombre de lignes réellement occupées après retour à la ligne : des noms
// de produits denses, avec beaucoup de mots courts et de majuscules (ex.
// "Outre Melted Hairline Kinky Soft Edges Glueless HD Lace Front Wig")
// remplissent moins bien chaque ligne qu'un nom au phrasé plus fluide, et
// peuvent déborder sur une 4e ligne avec un seuil trop généreux — vécu en
// pratique avec un vrai catalogue (PDF fourni par l'utilisatrice) où le
// nom se coupait en plein milieu d'un mot, SANS points de suspension
// visibles, perdant entièrement la couleur qu'on cherche justement à
// préserver. Seuil abaissé à 52 (au lieu de 78) pour une marge de
// sécurité large sur ce type de nom ; .sb-catalogue-nom-print porte en
// plus -webkit-line-clamp: 3 (app/globals.css) comme filet de sécurité —
// si ce texte déjà tronqué dépasse malgré tout 3 lignes, le navigateur le
// coupe proprement avec ses propres points de suspension plutôt que de
// couper un caractère en plein milieu sans aucun indicateur.
const LONGUEUR_NOM_IMPRESSION = 52;

// Tronque au milieu plutôt qu'à la fin : la fin du nom (presque toujours
// la couleur/variante pour les articles vendus ici, ex. "Blond", "Noir",
// "(Marron / Noir)") reste entièrement visible, seul le milieu du nom
// disparaît derrière des points de suspension. « Perruque Lace Front 20
// Pouces Naturelle Blond » devient « Perruque Lace Front 20… Blond »
// plutôt que « Perruque Lace Front 20 Pouces N…» qui masquerait la
// couleur. Uniquement pour l'affichage imprimé (voir .sb-catalogue-nom-
// print dans globals.css) — le nom complet reste toujours affiché à
// l'écran et enregistré tel quel en base de données, seul ce rendu
// imprimé est raccourci.
//
// La "queue" à préserver est un groupe entre parenthèses en toute fin de
// nom s'il y en a un (ex. "( Marron / Noir )"), sinon le dernier mot
// séparé par un espace. Un simple split sur les espaces, sans ce cas
// particulier, casse dès que la parenthèse fermante est précédée d'un
// espace : "( Marron / Noir )" donnait alors dernierMot = ")" tout seul,
// perdant "Marron / Noir" — bug constaté en pratique avec un vrai
// catalogue (PDF fourni par l'utilisatrice), qui perdait justement la
// couleur pour les variantes multi-couleurs. Traiter le groupe entier
// entre parenthèses comme un seul bloc insécable évite aussi qu'une
// coupure tombe juste après le "(" ouvrant (ex. l'ancien bug visible
// « DOMINICAN CURL… (… Hair) », où le début de la parenthèse se
// retrouvait des deux côtés des points de suspension).
function tronquerMilieuNom(nom, maxLen = LONGUEUR_NOM_IMPRESSION) {
  if (nom.length <= maxLen) return nom;
  const nomTrim = nom.trim();
  const matchParenFinale = nomTrim.match(/\(([^()]*)\)\s*$/);
  let queue;
  let avantQueue;
  if (matchParenFinale) {
    queue = matchParenFinale[0].trim();
    avantQueue = nomTrim.slice(0, matchParenFinale.index);
  } else {
    const mots = nomTrim.split(/\s+/);
    queue = mots[mots.length - 1];
    avantQueue = nomTrim.slice(0, nomTrim.length - queue.length);
  }
  const longueurDebut = Math.max(maxLen - queue.length - 1, 10);
  const debut = avantQueue.slice(0, longueurDebut).trimEnd();
  return `${debut}… ${queue}`;
}

export default function CataloguePage() {
  const { business } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const uniteLabel = (u) => t(`common.unites.${u || "unite"}`);
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
  const activeCategoryLabel =
    filtreCategorie === FILTRE_TOUTES ? null : filtresCategorie.find((opt) => opt.key === filtreCategorie)?.label;

  function buildTexte() {
    const titre =
      t("catalogue.shareTitle", { name: business?.name || "Doka" }) + (activeCategoryLabel ? ` — ${activeCategoryLabel}` : "");
    const lignes = filtres.map((a) => `• ${a.nom} — ${fmt(a.prix_vente)} / ${uniteLabel(a.unite)}`).join("\n");
    return `${titre}\n\n${lignes}\n\n${t("catalogue.shareFooter")}`;
  }

  function imprimer() {
    const original = document.title;
    document.title =
      `${t("catalogue.title")} — ${business?.name || "Doka"}` + (activeCategoryLabel ? ` — ${activeCategoryLabel}` : "");
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
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
        {/* Masqué à l'impression (sb-no-print) : redondant avec le bandeau
            .sb-catalogue-banner juste en dessous (nom de la boutique +
            tagline "Catalogue des produits disponibles"), qui joue déjà le
            rôle d'en-tête imprimé. Cette hauteur en trop, propre à l'écran,
            repoussait le premier groupe de 6 fiches hors de la page 1 —
            .sb-catalogue-page-group étant atomique (break-inside: avoid,
            voir globals.css), tout le groupe basculait alors en bloc sur
            la page 2 dès qu'il ne restait plus assez de place après ce
            titre + le bandeau, laissant la page 1 quasiment vide malgré
            une marge confortable mesurée en test (le test ne reproduisait
            pas cet en-tête réel, d'où le bug resté invisible jusqu'ici). */}
        <div className="sb-no-print">
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
          <button className="sb-btn sb-btn-primary" onClick={imprimer}>
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
          <div className="sb-catalogue-banner-tagline">
            {activeCategoryLabel ? `${t("catalogue.headerSub")} — ${activeCategoryLabel}` : t("catalogue.headerSub")}
          </div>
        </div>
      </div>

      {filtres.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 16 }}>{t("catalogue.aucunArticle")}</p>
      ) : (
        <div className="sb-catalogue-grid">
          {chunk(filtres, ARTICLES_PAR_PAGE_IMPRESSION).map((groupe, gi) => (
            <div key={gi} className="sb-catalogue-page-group">
              {groupe.map((a) => (
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
                  <div className="sb-catalogue-nom">
                    <span className="sb-catalogue-nom-screen">{a.nom}</span>
                    <span className="sb-catalogue-nom-print">{tronquerMilieuNom(a.nom)}</span>
                  </div>
                  <div className="sb-catalogue-prix">
                    {fmt(a.prix_vente)} <span className="sb-catalogue-unite">/ {uniteLabel(a.unite)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="sb-no-print" style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 16 }}>
        {t("catalogue.instagramNote")}
      </p>
    </div>
  );
}
