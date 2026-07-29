"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, monthLabel, dateLocale } from "@/lib/format";
import { THEMES } from "@/lib/constants";
import { t as tBase } from "@/lib/i18n";

function buildEvolution(commandes, mode, lang, t) {
  const now = new Date();
  if (mode === "mois") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const weeksCount = Math.ceil(daysInMonth / 7);
    const buckets = Array.from({ length: weeksCount }, (_, i) => ({ label: t("dashboard.semaine", { n: i + 1 }), ca: 0 }));
    commandes.forEach((c) => {
      const d = new Date(c.created_at);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        const w = Math.min(weeksCount, Math.ceil(d.getDate() / 7));
        buckets[w - 1].ca += c.ca;
      }
    });
    return buckets;
  }
  const monthsBack = mode === "trimestre" ? 3 : 6;
  const buckets = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: monthLabel(d, lang), ca: 0 });
  }
  commandes.forEach((c) => {
    const d = new Date(c.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = buckets.find((x) => x.key === key);
    if (b) b.ca += c.ca;
  });
  return buckets;
}

export default function DashboardPage() {
  const { business } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [commandes, setCommandes] = useState([]);
  const [articles, setArticles] = useState([]);
  const [nbClients, setNbClients] = useState(0);
  const [loading, setLoading] = useState(true);
  const [intervalMode, setIntervalMode] = useState("trimestre");

  const accent = THEMES[business?.theme_key || "orange"].accent;

  useEffect(() => {
    if (!business?.id) return;
    let active = true;

    async function load() {
      setLoading(true);
      const [commandesRes, articlesRes, clientsRes] = await Promise.all([
        supabase
          .from("commandes")
          .select("id, numero, created_at, ca, marge, clients(nom)")
          .eq("business_id", business.id)
          .eq("statut", "livree")
          .order("created_at", { ascending: false }),
        supabase.from("articles").select("*").eq("business_id", business.id),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("business_id", business.id),
      ]);
      if (!active) return;
      setCommandes(commandesRes.data || []);
      setArticles(articlesRes.data || []);
      setNbClients(clientsRes.count || 0);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  const now = new Date();
  const isSameMonth = (iso) => {
    const d = new Date(iso);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };
  const commandesDuMois = commandes.filter((c) => isSameMonth(c.created_at));
  const caDuMois = commandesDuMois.reduce((s, c) => s + c.ca, 0);
  const margeDuMois = commandesDuMois.reduce((s, c) => s + c.marge, 0);
  const stockFaible = articles.filter((a) => a.stock <= a.seuil);
  const rupturesTriees = [...stockFaible].sort((a, b) => a.stock - b.stock);
  const tickerItems = [...rupturesTriees, ...rupturesTriees];

  const evolution = useMemo(
    () => buildEvolution(commandes, intervalMode, business?.langue, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t change de comportement en même temps que business?.langue
    [commandes, intervalMode, business?.langue]
  );
  const dernieresCommandes = commandes.slice(0, 5);

  if (loading) return <p className="sb-sub">{t("dashboard.loading")}</p>;

  return (
    <div>
      <h1 className="sb-h1">{t("dashboard.title")}</h1>
      <p className="sb-sub">{t("dashboard.subtitle")}</p>

      <div className="sb-grid-stats">
        <div className="sb-card">
          <div className="sb-stat-label">{t("dashboard.ca")}</div>
          <div className="sb-stat-value" style={{ color: accent }}>
            {fmt(caDuMois)}
          </div>
        </div>
        <div className="sb-card">
          <div className="sb-stat-label">{t("dashboard.marge")}</div>
          <div className="sb-stat-value" style={{ color: "#0E8F6E" }}>
            {fmt(margeDuMois)}
          </div>
        </div>
        <div className="sb-card">
          <div className="sb-stat-label">{t("dashboard.clients")}</div>
          <div className="sb-stat-value" style={{ color: "#2E2C2B" }}>
            {nbClients}
          </div>
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="sb-section-title" style={{ margin: 0 }}>
            {t("dashboard.evolution")}
          </div>
          <div className="sb-toggle-group">
            {[
              { key: "mois", label: t("dashboard.mois") },
              { key: "trimestre", label: t("dashboard.trimestre") },
              { key: "semestre", label: t("dashboard.semestre") },
            ].map((opt) => (
              <button
                key={opt.key}
                className={`sb-toggle-item${intervalMode === opt.key ? " active" : ""}`}
                onClick={() => setIntervalMode(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={evolution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E4E2D8" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6B6A63" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#6B6A63" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E4E2D8" }} />
            <Bar dataKey="ca" fill={accent} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="sb-dash-split">
        <div className="sb-card">
          <div className="sb-section-title">{t("dashboard.dernieresCommandes")}</div>
          {dernieresCommandes.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6B6A63" }}>{t("dashboard.aucuneCommande")}</p>
          ) : (
            <div className="sb-table-scroll">
              <table className="sb-table">
                <thead>
                  <tr>
                    <th>{t("dashboard.colNumero")}</th>
                    <th>{t("dashboard.colCliente")}</th>
                    <th>{t("dashboard.colDate")}</th>
                    <th>{t("dashboard.colCa")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dernieresCommandes.map((c) => (
                    <tr key={c.id}>
                      <td className="sb-mono">{c.numero}</td>
                      <td>{c.clients?.nom ?? "—"}</td>
                      <td style={{ color: "#6B6A63" }}>{new Date(c.created_at).toLocaleDateString(dateLocale(business?.langue))}</td>
                      <td className="sb-mono">{fmt(c.ca)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link href="/commandes" className="sb-btn sb-btn-ghost" style={{ marginTop: 14 }}>
            {t("dashboard.voirCommandes")} <ChevronRight size={14} />
          </Link>
        </div>

        <div className="sb-card">
          <div className="sb-section-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} color="#C9862B" /> {t("dashboard.presqueRupture")}
          </div>
          {rupturesTriees.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6B6A63" }}>{t("dashboard.aucuneAlerte")}</p>
          ) : (
            <div className="sb-ticker">
              <div
                className="sb-ticker-track"
                style={{ animationDuration: `${Math.max(6, rupturesTriees.length * 3)}s` }}
              >
                {tickerItems.map((a, i) => (
                  <div className="sb-ticker-item" key={i}>
                    <span>{a.nom}</span>
                    {a.stock === 0 ? (
                      <span className="sb-badge sb-badge-coral">{t("common.badgeRupture")}</span>
                    ) : (
                      <span className="sb-badge sb-badge-amber">{t("dashboard.restant", { n: a.stock })}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link href="/articles" className="sb-btn sb-btn-ghost" style={{ marginTop: 14 }}>
            {t("dashboard.voirStock")} <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
