"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { FileSpreadsheet, Printer } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, fmtCompact as fmtCompactBase, shouldCompactLabels, monthLabel, dateLocale } from "@/lib/format";
import useElementWidth from "@/lib/useElementWidth";
import { THEMES } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";
import { exportToExcel, dateFichier } from "@/lib/exportExcel";

const MOIS_A_AFFICHER = 12;
const PERIODE_MOIS = { mois: 1, trimestre: 3, semestre: 6, annee: 12 };
const PERIODES = ["semaine", "mois", "trimestre", "semestre", "annee"];

// Un mois par entrée, du plus ancien (11 mois avant aujourd'hui) au plus
// récent (mois courant) — sert à la fois de source pour le tableau des 12
// derniers mois et pour les périodes du graphique (trimestre/semestre/année
// en prennent simplement les N dernières entrées).
function buildMonthlyBuckets(commandes, lang) {
  const now = new Date();
  const buckets = [];
  for (let i = MOIS_A_AFFICHER - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: monthLabel(d, lang),
      labelFull: d.toLocaleDateString(dateLocale(lang), { month: "short", year: "numeric" }),
      ca: 0,
      marge: 0,
    });
  }
  commandes.forEach((c) => {
    const d = new Date(c.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = buckets.find((x) => x.key === key);
    if (b) {
      b.ca += c.ca;
      b.marge += c.marge;
    }
  });
  return buckets;
}

function buildSemaines(commandes, t) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const weeksCount = Math.ceil(daysInMonth / 7);
  const buckets = Array.from({ length: weeksCount }, (_, i) => ({ label: t("dashboard.semaine", { n: i + 1 }), ca: 0, marge: 0 }));
  commandes.forEach((c) => {
    const d = new Date(c.created_at);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      const w = Math.min(weeksCount, Math.ceil(d.getDate() / 7));
      buckets[w - 1].ca += c.ca;
      buckets[w - 1].marge += c.marge;
    }
  });
  return buckets;
}

// Un jour par entrée pour les 7 derniers jours glissants (aujourd'hui
// inclus) — répartition de la semaine en cours, même niveau de détail
// qu'offre buildSemaines() pour le mois courant (semaine -> jours, comme
// mois -> semaines). "labelFull" (ex. "22 août") sert à construire la
// plage affichée dans l'en-tête du rapport imprimé (periodeRangeLabel).
function buildJoursSemaine(commandes, lang) {
  const now = new Date();
  const buckets = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      label: capitalize(d.toLocaleDateString(dateLocale(lang), { weekday: "short" }).replace(".", "")),
      labelFull: d.toLocaleDateString(dateLocale(lang), { day: "2-digit", month: "long" }),
      ca: 0,
      marge: 0,
    });
  }
  commandes.forEach((c) => {
    const d = new Date(c.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const b = buckets.find((x) => x.key === key);
    if (b) {
      b.ca += c.ca;
      b.marge += c.marge;
    }
  });
  return buckets;
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Ex. "22 août à 28 août" (semaine), "Mai à Juillet 2026" (trimestre/
// semestre/année) ou "Juillet 2026" (mois).
function periodeRangeLabel(periode, moisBuckets, joursSemaineBuckets) {
  if (periode === "semaine") {
    const premier = joursSemaineBuckets[0];
    const dernier = joursSemaineBuckets[joursSemaineBuckets.length - 1];
    if (!premier || !dernier) return "";
    return `${premier.labelFull} à ${dernier.labelFull}`;
  }
  if (periode === "mois") {
    return capitalize(moisBuckets[moisBuckets.length - 1]?.labelFull || "");
  }
  const slice = moisBuckets.slice(-PERIODE_MOIS[periode]);
  const premier = slice[0];
  const dernier = slice[slice.length - 1];
  if (!premier || !dernier) return "";
  if (premier.key === dernier.key) return capitalize(dernier.labelFull);
  return `${capitalize(premier.label)} à ${capitalize(dernier.labelFull)}`;
}

// Étiquette de valeur affichée en permanence au-dessus de chaque barre
// (jamais seulement au survol de la souris) — recharts calcule x/y/width
// d'après la barre réellement dessinée, on centre juste le texte dessus
// avec un léger décalage vertical. Valeurs nulles ignorées : un "0" sur
// chaque mois sans commande surchargerait le graphique sans rien
// apporter.
function renderBarValueLabel(formatter, color) {
  return function BarValueLabel({ x, y, width, value }) {
    if (!value) return null;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fontFamily='"IBM Plex Mono", monospace' fill={color}>
        {formatter(value)}
      </text>
    );
  };
}

export default function TresoreriePage() {
  const router = useRouter();
  const { business } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const fmtCompact = (n) => fmtCompactBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const accent = THEMES[business?.theme_key || "orange"].accent;
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState("trimestre");
  const [platformLogo, setPlatformLogo] = useState("");

  // Destination de la notification push hebdomadaire (voir
  // app/api/cron/rapport-hebdo) : /tresorerie?periode=semaine ouvre
  // directement cette page avec la période réglée sur "Semaine", plutôt
  // que sur "Trimestre" par défaut. Lu une seule fois au montage
  // (window.location.search, jamais useSearchParams — même principe déjà
  // en place pour ?tour=1 sur le Dashboard) puis retiré de l'URL une fois
  // appliqué, pour ne pas re-déclencher si la page est rafraîchie/partagée.
  useEffect(() => {
    const periodeParam = new URLSearchParams(window.location.search).get("periode");
    if (PERIODES.includes(periodeParam)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- window.location n'est lisible que côté client, ce déclenchement ponctuel (au montage) ne peut pas se faire pendant le rendu
      setPeriode(periodeParam);
      router.replace("/tresorerie");
    }
  }, [router]);

  // Logo Doka pour le pied de page "Propulsé par Doka" du rapport imprimé —
  // indépendant du logo de boutique, affiché dans l'en-tête.
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
      const now = new Date();
      const depuis = new Date(now.getFullYear(), now.getMonth() - (MOIS_A_AFFICHER - 1), 1).toISOString();
      const { data } = await supabase
        .from("commandes")
        .select("created_at, ca, marge")
        .eq("business_id", business.id)
        .eq("statut", "livree")
        .gte("created_at", depuis)
        .order("created_at", { ascending: true });
      if (!active) return;
      setCommandes(data || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  const moisBuckets = useMemo(() => buildMonthlyBuckets(commandes, business?.langue), [commandes, business?.langue]);
  const semaineBuckets = useMemo(
    () => buildSemaines(commandes, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t change de comportement en même temps que business?.langue
    [commandes, business?.langue]
  );
  const joursSemaineBuckets = useMemo(() => buildJoursSemaine(commandes, business?.langue), [commandes, business?.langue]);

  const chartData = periode === "semaine" ? joursSemaineBuckets : periode === "mois" ? semaineBuckets : moisBuckets.slice(-PERIODE_MOIS[periode]);
  const totaux = chartData.reduce((acc, b) => ({ ca: acc.ca + b.ca, marge: acc.marge + b.marge }), { ca: 0, marge: 0 });
  const tableRows = [...moisBuckets].reverse();
  const aucuneDonnee = chartData.every((b) => b.ca === 0 && b.marge === 0);
  const [chartRef, chartWidth] = useElementWidth();
  const compactLabels = shouldCompactLabels(
    chartData.flatMap((b) => [b.ca, b.marge]),
    chartData.length * 2,
    business?.devise,
    chartWidth
  );

  function imprimer() {
    const original = document.title;
    document.title = `${t("tresorerie.rapportTitle")} — ${business?.name || "Doka"}`;
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  function exporterExcel() {
    const rows = tableRows.map((b) => ({
      [t("tresorerie.colMois")]: b.labelFull,
      [t("tresorerie.colCa")]: b.ca,
      [t("tresorerie.colMarge")]: b.marge,
    }));
    exportToExcel(`tresorerie-${dateFichier()}.xlsx`, "Tresorerie", rows);
  }

  if (loading) return <p className="sb-sub">{t("tresorerie.loading")}</p>;

  return (
    <>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 className="sb-h1">{t("tresorerie.title")}</h1>
            <p className="sb-sub">{t("tresorerie.subtitle")}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="sb-btn sb-btn-ghost" onClick={exporterExcel}>
              <FileSpreadsheet size={13} /> {t("common.exporterExcel")}
            </button>
            <button className="sb-btn sb-btn-primary" onClick={imprimer}>
              <Printer size={13} /> {t("tresorerie.imprimerPdf")}
            </button>
          </div>
        </div>

        <div className="sb-grid-stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="sb-card">
            <div className="sb-stat-label">{t("tresorerie.caTotal")}</div>
            <div className="sb-stat-value" style={{ color: accent }}>
              {fmt(totaux.ca)}
            </div>
          </div>
          <div className="sb-card">
            <div className="sb-stat-label">{t("tresorerie.margeTotale")}</div>
            <div className="sb-stat-value" style={{ color: "var(--emerald)" }}>
              {fmt(totaux.marge)}
            </div>
          </div>
        </div>

        <div className="sb-card" style={{ marginBottom: 20 }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}
          >
            <div className="sb-section-title" style={{ margin: 0 }}>
              {t("tresorerie.evolutionTitle")}
            </div>
            <div className="sb-toggle-group">
              {PERIODES.map((key) => (
                <button
                  key={key}
                  className={`sb-toggle-item${periode === key ? " active" : ""}`}
                  onClick={() => setPeriode(key)}
                >
                  {t(`tresorerie.${key}`)}
                </button>
              ))}
            </div>
          </div>
          {aucuneDonnee ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("tresorerie.aucuneDonnee")}</p>
          ) : (
            <div ref={chartRef}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={chartData} margin={{ top: 22, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip
                    formatter={(v) => fmt(v)}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(v) => (v === "ca" ? t("tresorerie.legendCa") : t("tresorerie.legendMarge"))}
                  />
                  <Bar dataKey="ca" name="ca" fill={accent} radius={[5, 5, 0, 0]}>
                    <LabelList dataKey="ca" content={renderBarValueLabel(compactLabels ? fmtCompact : fmt, accent)} />
                  </Bar>
                  <Bar dataKey="marge" name="marge" fill="var(--emerald)" radius={[5, 5, 0, 0]}>
                    <LabelList dataKey="marge" content={renderBarValueLabel(compactLabels ? fmtCompact : fmt, "var(--emerald)")} />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="sb-card">
          <div className="sb-section-title">{t("tresorerie.tableTitle")}</div>
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("tresorerie.colMois")}</th>
                  <th>{t("tresorerie.colCa")}</th>
                  <th>{t("tresorerie.colMarge")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((b) => (
                  <tr key={b.key}>
                    <td>{b.labelFull}</td>
                    <td className="sb-mono">{fmt(b.ca)}</td>
                    <td className="sb-mono">{fmt(b.marge)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mise en page dédiée à l'impression — pleine page A4, invisible à
          l'écran. Rendue via un portail directement dans <body> (comme
          components/Receipt.js) pour ne dépendre d'aucune structure de page
          parente. Le portail ne produit aucun DOM à cet endroit précis de
          l'arbre React (son contenu est téléporté dans <body>), donc ce
          garde-fou ne crée pas de désaccord d'hydratation — il évite
          seulement le crash de `document` pendant le rendu serveur de
          cette page, statiquement pré-rendue. Uniquement le tableau
          récapitulatif et les totaux, pas le graphique — voir la note
          dans globals.css. */}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="sb-tresorerie-print">
            <div className="sb-tresorerie-print-header">
              <div className="sb-tresorerie-print-brand">
                {business?.logo_url ? (
                  <img src={business.logo_url} alt={business?.name || "Logo"} />
                ) : (
                  <div className="sb-tresorerie-print-logo-fallback">{(business?.name || "Doka").slice(0, 2).toUpperCase()}</div>
                )}
                <span className="sb-tresorerie-print-brand-name">{business?.name || t("common.defaultBusinessName")}</span>
              </div>
              <div className="sb-tresorerie-print-title">
                <h1>{t("tresorerie.rapportTitle")}</h1>
                <p>
                  {t("tresorerie.rapportPeriode", {
                    periode: t(`tresorerie.${periode}`),
                    range: periodeRangeLabel(periode, moisBuckets, joursSemaineBuckets),
                  })}
                </p>
              </div>
            </div>

            <div className="sb-tresorerie-print-totals">
              <div>
                <div className="label">{t("tresorerie.caTotal")}</div>
                <div className="value">{fmt(totaux.ca)}</div>
              </div>
              <div>
                <div className="label">{t("tresorerie.margeTotale")}</div>
                <div className="value">{fmt(totaux.marge)}</div>
              </div>
            </div>

            <table className="sb-tresorerie-print-table">
              <thead>
                <tr>
                  <th>{t("tresorerie.colMois")}</th>
                  <th>{t("tresorerie.colCa")}</th>
                  <th>{t("tresorerie.colMarge")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((b) => (
                  <tr key={b.key}>
                    <td>{b.labelFull}</td>
                    <td>{fmt(b.ca)}</td>
                    <td>{fmt(b.marge)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="sb-tresorerie-print-footer">
              {platformLogo && <img src={platformLogo} alt="" />}
              {t("common.poweredBy")}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
