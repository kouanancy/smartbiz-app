"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, monthLabel, dateLocale } from "@/lib/format";
import { THEMES } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";

const MOIS_A_AFFICHER = 12;
const PERIODE_MOIS = { mois: 1, trimestre: 3, semestre: 6, annee: 12 };

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

export default function TresoreriePage() {
  const { business } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const accent = THEMES[business?.theme_key || "orange"].accent;
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState("trimestre");

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

  const chartData = periode === "mois" ? semaineBuckets : moisBuckets.slice(-PERIODE_MOIS[periode]);
  const totaux = chartData.reduce((acc, b) => ({ ca: acc.ca + b.ca, marge: acc.marge + b.marge }), { ca: 0, marge: 0 });
  const tableRows = [...moisBuckets].reverse();
  const aucuneDonnee = chartData.every((b) => b.ca === 0 && b.marge === 0);

  if (loading) return <p className="sb-sub">{t("tresorerie.loading")}</p>;

  return (
    <div>
      <h1 className="sb-h1">{t("tresorerie.title")}</h1>
      <p className="sb-sub">{t("tresorerie.subtitle")}</p>

      <div className="sb-grid-stats" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="sb-card">
          <div className="sb-stat-label">{t("tresorerie.caTotal")}</div>
          <div className="sb-stat-value" style={{ color: accent }}>
            {fmt(totaux.ca)}
          </div>
        </div>
        <div className="sb-card">
          <div className="sb-stat-label">{t("tresorerie.margeTotale")}</div>
          <div className="sb-stat-value" style={{ color: "#0E8F6E" }}>
            {fmt(totaux.marge)}
          </div>
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div className="sb-section-title" style={{ margin: 0 }}>
            {t("tresorerie.evolutionTitle")}
          </div>
          <div className="sb-toggle-group">
            {["mois", "trimestre", "semestre", "annee"].map((key) => (
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
          <p style={{ fontSize: 13, color: "#6B6A63" }}>{t("tresorerie.aucuneDonnee")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E2D8" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6B6A63" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6B6A63" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E4E2D8" }} />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={(v) => (v === "ca" ? t("tresorerie.legendCa") : t("tresorerie.legendMarge"))}
              />
              <Bar dataKey="ca" name="ca" fill={accent} radius={[5, 5, 0, 0]} />
              <Bar dataKey="marge" name="marge" fill="#0E8F6E" radius={[5, 5, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
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
  );
}
