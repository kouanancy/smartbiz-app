"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Printer, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale } from "@/lib/format";
import { THEMES } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";

const JOURS_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_VENTES_MAX = 5;

function formatDate(d, langue) {
  return d.toLocaleDateString(dateLocale(langue), { day: "2-digit", month: "long", year: "numeric" });
}

// Page consultable à tout moment (bouton "Rapport hebdo" du Dashboard) et
// destination du clic sur la notification hebdomadaire (voir
// app/api/cron/rapport-hebdo) — toujours les 7 derniers jours glissants
// depuis l'instant de la consultation, jamais un instantané figé au
// moment de l'envoi : évite d'avoir à stocker une copie du contenu du
// rapport en base, la page recalcule simplement la même fenêtre roulante
// que le cron, à la demande.
export default function RapportHebdoPage() {
  const { business } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const accent = THEMES[business?.theme_key || "orange"].accent;
  const [loading, setLoading] = useState(true);
  const [ca, setCa] = useState(0);
  const [marge, setMarge] = useState(0);
  const [topVentes, setTopVentes] = useState([]);
  const [alertesStock, setAlertesStock] = useState([]);
  const [platformLogo, setPlatformLogo] = useState("");
  const [periodeRange, setPeriodeRange] = useState(null);

  // Logo Doka pour le pied de page du rapport imprimé — indépendant du
  // logo de boutique, affiché dans l'en-tête (même principe que
  // app/(app)/tresorerie/page.js).
  useEffect(() => {
    supabase
      .from("parametres_globaux")
      .select("logo_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPlatformLogo(data?.logo_url || ""));
  }, []);

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      setLoading(true);
      const maintenant = new Date();
      const debutPeriode = new Date(maintenant.getTime() - JOURS_MS);
      const depuis = debutPeriode.toISOString();
      setPeriodeRange({ debut: debutPeriode, fin: maintenant });

      // CA / marge réelle — mêmes règles que partout ailleurs dans l'app
      // (Dashboard, Trésorerie, cron rapport-hebdo) : uniquement les
      // commandes livrées.
      const { data: commandes } = await supabase
        .from("commandes")
        .select("ca, marge")
        .eq("business_id", business.id)
        .eq("statut", "livree")
        .gte("created_at", depuis);
      if (!active) return;
      setCa((commandes || []).reduce((s, c) => s + c.ca, 0));
      setMarge((commandes || []).reduce((s, c) => s + c.marge, 0));

      // Top ventes de la semaine — même idiome de jointure que
      // app/(app)/statistiques/page.js. offert = false : un cadeau n'est
      // jamais une vente, il ne doit jamais apparaître dans ce classement.
      const { data: lignes } = await supabase
        .from("commande_lignes")
        .select("quantite, articles(nom), commandes!inner(business_id, statut, created_at)")
        .eq("commandes.business_id", business.id)
        .eq("commandes.statut", "livree")
        .eq("offert", false)
        .gte("commandes.created_at", depuis);
      if (!active) return;
      const quantitesParArticle = new Map();
      (lignes || []).forEach((l) => {
        const nom = l.articles?.nom;
        if (!nom) return;
        quantitesParArticle.set(nom, (quantitesParArticle.get(nom) || 0) + l.quantite);
      });
      setTopVentes(
        [...quantitesParArticle.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, TOP_VENTES_MAX)
          .map(([nom, quantite]) => ({ nom, quantite }))
      );

      // Alertes de stock — mêmes seuils que le ticker "Presque en rupture"
      // du Dashboard (stock <= seuil), triées par stock croissant : les
      // articles les plus urgents en premier.
      const { data: articles } = await supabase.from("articles").select("nom, stock, seuil").eq("business_id", business.id);
      if (!active) return;
      setAlertesStock((articles || []).filter((a) => a.stock <= a.seuil).sort((a, b) => a.stock - b.stock));

      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  function imprimer() {
    const original = document.title;
    document.title = `${t("rapportHebdo.title")} — ${business?.name || "Doka"}`;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  if (loading || !periodeRange) return <p className="sb-sub">{t("rapportHebdo.loading")}</p>;

  const periodeLabel = t("rapportHebdo.periode", {
    debut: formatDate(periodeRange.debut, business?.langue),
    fin: formatDate(periodeRange.fin, business?.langue),
  });

  return (
    <>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 className="sb-h1">{t("rapportHebdo.title")}</h1>
            <p className="sb-sub">{t("rapportHebdo.subtitle")}</p>
          </div>
          <button className="sb-btn sb-btn-primary" onClick={imprimer}>
            <Printer size={13} /> {t("rapportHebdo.imprimerBtn")}
          </button>
        </div>

        <div className="sb-grid-stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="sb-card">
            <div className="sb-stat-label">{t("rapportHebdo.ca")}</div>
            <div className="sb-stat-value" style={{ color: accent }}>
              {fmt(ca)}
            </div>
          </div>
          <div className="sb-card">
            <div className="sb-stat-label">{t("rapportHebdo.marge")}</div>
            <div className="sb-stat-value" style={{ color: "var(--emerald)" }}>
              {fmt(marge)}
            </div>
          </div>
        </div>

        <div className="sb-card" style={{ marginBottom: 20 }}>
          <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingUp size={16} /> {t("rapportHebdo.topVentesTitle")}
          </div>
          {topVentes.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("rapportHebdo.aucuneVente")}</p>
          ) : (
            <div className="sb-table-scroll">
              <table className="sb-table">
                <thead>
                  <tr>
                    <th>{t("rapportHebdo.colRang")}</th>
                    <th>{t("rapportHebdo.colArticle")}</th>
                    <th>{t("rapportHebdo.colQuantite")}</th>
                  </tr>
                </thead>
                <tbody>
                  {topVentes.map((v, i) => (
                    <tr key={v.nom}>
                      <td className="sb-mono">{i + 1}</td>
                      <td>{v.nom}</td>
                      <td className="sb-mono">{v.quantite}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sb-card">
          <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} /> {t("rapportHebdo.alertesStockTitle")}
          </div>
          {alertesStock.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("rapportHebdo.aucuneAlerteStock")}</p>
          ) : (
            <div className="sb-table-scroll">
              <table className="sb-table">
                <thead>
                  <tr>
                    <th>{t("rapportHebdo.colArticle")}</th>
                    <th>{t("rapportHebdo.colStock")}</th>
                    <th>{t("rapportHebdo.colSeuil")}</th>
                  </tr>
                </thead>
                <tbody>
                  {alertesStock.map((a) => (
                    <tr key={a.nom}>
                      <td>{a.nom}</td>
                      <td className="sb-mono">{a.stock}</td>
                      <td className="sb-mono">{a.seuil}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Mise en page dédiée à l'impression — pleine page A4, invisible à
          l'écran. Rendue via un portail directement dans <body> (même
          principe que app/(app)/tresorerie/page.js) pour ne dépendre
          d'aucune structure de page parente. Voir globals.css pour le
          garde-fou anti-coupure de section entre deux pages
          (break-inside: avoid sur chaque <tr> et sur les blocs totaux). */}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="sb-rapport-hebdo-print">
            <div className="sb-rapport-hebdo-print-header">
              <div className="sb-rapport-hebdo-print-brand">
                {business?.logo_url ? (
                  <img src={business.logo_url} alt={business?.name || "Logo"} />
                ) : (
                  <div className="sb-rapport-hebdo-print-logo-fallback">{(business?.name || "Doka").slice(0, 2).toUpperCase()}</div>
                )}
                <span className="sb-rapport-hebdo-print-brand-name">{business?.name || t("common.defaultBusinessName")}</span>
              </div>
              <div className="sb-rapport-hebdo-print-title">
                <h1>{t("rapportHebdo.title")}</h1>
                <p>{periodeLabel}</p>
              </div>
            </div>

            <div className="sb-rapport-hebdo-print-totals">
              <div>
                <div className="label">{t("rapportHebdo.ca")}</div>
                <div className="value">{fmt(ca)}</div>
              </div>
              <div>
                <div className="label">{t("rapportHebdo.marge")}</div>
                <div className="value">{fmt(marge)}</div>
              </div>
            </div>

            <p className="sb-rapport-hebdo-print-section-title">{t("rapportHebdo.topVentesTitle")}</p>
            {topVentes.length === 0 ? (
              <p className="sb-rapport-hebdo-print-empty">{t("rapportHebdo.aucuneVente")}</p>
            ) : (
              <table className="sb-rapport-hebdo-print-table">
                <thead>
                  <tr>
                    <th>{t("rapportHebdo.colRang")}</th>
                    <th>{t("rapportHebdo.colArticle")}</th>
                    <th style={{ textAlign: "right" }}>{t("rapportHebdo.colQuantite")}</th>
                  </tr>
                </thead>
                <tbody>
                  {topVentes.map((v, i) => (
                    <tr key={v.nom}>
                      <td>{i + 1}</td>
                      <td>{v.nom}</td>
                      <td style={{ textAlign: "right" }}>{v.quantite}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p className="sb-rapport-hebdo-print-section-title">{t("rapportHebdo.alertesStockTitle")}</p>
            {alertesStock.length === 0 ? (
              <p className="sb-rapport-hebdo-print-empty">{t("rapportHebdo.aucuneAlerteStock")}</p>
            ) : (
              <table className="sb-rapport-hebdo-print-table">
                <thead>
                  <tr>
                    <th>{t("rapportHebdo.colArticle")}</th>
                    <th style={{ textAlign: "right" }}>{t("rapportHebdo.colStock")}</th>
                    <th style={{ textAlign: "right" }}>{t("rapportHebdo.colSeuil")}</th>
                  </tr>
                </thead>
                <tbody>
                  {alertesStock.map((a) => (
                    <tr key={a.nom}>
                      <td>{a.nom}</td>
                      <td style={{ textAlign: "right" }}>{a.stock}</td>
                      <td style={{ textAlign: "right" }}>{a.seuil}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="sb-rapport-hebdo-print-footer">
              {platformLogo && <img src={platformLogo} alt="" />}
              {t("common.poweredBy")}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
