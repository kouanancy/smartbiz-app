"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ArrowUpDown, Bell, FileSpreadsheet, Printer, Trash2 } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase, dateLocale, monthLabel } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { THEMES } from "@/lib/constants";
import { exportToExcel, dateFichier } from "@/lib/exportExcel";
import LogoPlatformUpload from "@/components/LogoPlatformUpload";
import ImageUploadField from "@/components/ImageUploadField";

const STATUT_BADGE_CLASS = {
  essai: "sb-badge-amber",
  actif: "sb-badge-emerald",
  en_attente_paiement: "sb-badge-amber",
  expire: "sb-badge-coral",
  suspendu: "sb-badge-coral",
};

function expireBientot(b) {
  if (!["actif", "essai"].includes(b.subscription_status) || !b.subscription_expires_at) return false;
  const diffJours = (new Date(b.subscription_expires_at) - new Date()) / (1000 * 60 * 60 * 24);
  return diffJours >= 0 && diffJours <= 7;
}

const MOIS_A_AFFICHER = 12;
const PERIODE_MOIS = { mois: 1, trimestre: 3, semestre: 6, annee: 12 };

// Un mois par entrée (11 mois avant aujourd'hui → mois courant), rempli à
// partir des paiements validés (statut "reussi") — même principe que
// buildMonthlyBuckets de la Trésorerie, mais un seul champ (montant) et
// regroupé sur valide_at (date d'encaissement) plutôt que created_at (date
// d'envoi du justificatif).
function buildMonthlyBucketsRevenus(paiements, lang) {
  const now = new Date();
  const buckets = [];
  for (let i = MOIS_A_AFFICHER - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: monthLabel(d, lang),
      labelFull: d.toLocaleDateString(dateLocale(lang), { month: "short", year: "numeric" }),
      montant: 0,
    });
  }
  paiements.forEach((p) => {
    if (!p.valide_at) return;
    const d = new Date(p.valide_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = buckets.find((x) => x.key === key);
    if (b) b.montant += p.montant;
  });
  return buckets;
}

function buildSemainesRevenus(paiements, t) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const weeksCount = Math.ceil(daysInMonth / 7);
  const buckets = Array.from({ length: weeksCount }, (_, i) => ({ label: t("dashboard.semaine", { n: i + 1 }), montant: 0 }));
  paiements.forEach((p) => {
    if (!p.valide_at) return;
    const d = new Date(p.valide_at);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      const w = Math.min(weeksCount, Math.ceil(d.getDate() / 7));
      buckets[w - 1].montant += p.montant;
    }
  });
  return buckets;
}

export default function AdminPage() {
  const { business } = useAuth();
  const router = useRouter();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const accent = THEMES[business?.theme_key || "orange"].accent;
  const [businesses, setBusinesses] = useState([]);
  const [paiementsEnAttente, setPaiementsEnAttente] = useState([]);
  const [paiementsReussis, setPaiementsReussis] = useState([]);
  const [periodeRevenu, setPeriodeRevenu] = useState("trimestre");
  const [triDateAsc, setTriDateAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [logoMsg, setLogoMsg] = useState("");
  const [parametresGlobaux, setParametresGlobaux] = useState(null);
  const [waveQrDraft, setWaveQrDraft] = useState("");
  const [waveTelDraft, setWaveTelDraft] = useState("");
  const [prixDraft, setPrixDraft] = useState("");
  const [waveMsg, setWaveMsg] = useState("");
  const [supportTelDraft, setSupportTelDraft] = useState("");
  const [supportMsg, setSupportMsg] = useState("");

  useEffect(() => {
    if (business && !business.is_admin) router.replace("/dashboard");
  }, [business, router]);

  useEffect(() => {
    if (!business?.is_admin) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [businessesRes, paiementsRes, paiementsReussisRes, parametresRes] = await Promise.all([
        supabase.rpc("admin_list_businesses"),
        supabase.from("paiements_abonnement").select("*").eq("statut", "en_attente").order("created_at", { ascending: true }),
        supabase.from("paiements_abonnement").select("*").eq("statut", "reussi").order("valide_at", { ascending: false }),
        supabase.from("parametres_globaux").select("*").maybeSingle(),
      ]);
      if (!active) return;
      setBusinesses(
        (businessesRes.data || []).sort((a, b) => {
          if (!a.subscription_expires_at) return 1;
          if (!b.subscription_expires_at) return -1;
          return new Date(a.subscription_expires_at) - new Date(b.subscription_expires_at);
        })
      );
      setPaiementsEnAttente(paiementsRes.data || []);
      setPaiementsReussis(paiementsReussisRes.data || []);
      const parametres = parametresRes.data || null;
      setParametresGlobaux(parametres);
      if (parametres) {
        setWaveQrDraft(parametres.wave_qr_url || "");
        setWaveTelDraft(parametres.wave_telephone || "");
        setPrixDraft(String(parametres.abonnement_prix ?? ""));
        setSupportTelDraft(parametres.support_telephone || "");
      }
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.is_admin]);

  async function supprimerPaiement(p) {
    const confirmed = window.confirm(t("admin.revenus.confirmDelete"));
    if (!confirmed) return;
    const { error } = await supabase.from("paiements_abonnement").delete().eq("id", p.id);
    if (error) {
      setMsg(t("admin.revenus.deleteError", { message: error.message }));
      return;
    }
    setPaiementsReussis((prev) => prev.filter((x) => x.id !== p.id));
  }

  async function enregistrerLogoPlatform(urls) {
    if (!parametresGlobaux?.id) return;
    const { data, error } = await supabase.from("parametres_globaux").update(urls).eq("id", parametresGlobaux.id).select().single();
    if (error) {
      setLogoMsg(t("admin.logoSaveError", { message: error.message }));
      return;
    }
    setParametresGlobaux(data);
    setLogoMsg(t("admin.logoSaveSuccess"));
  }

  async function enregistrerParametresGlobaux() {
    if (!parametresGlobaux) return;
    const prix = Number(prixDraft);
    if (Number.isNaN(prix) || prix < 0) {
      setWaveMsg(t("admin.waveMontantInvalide"));
      return;
    }
    // wave_telephone reste une chaîne de caractères (jamais Number(...)) :
    // un numéro local commence par 0, et convertir en nombre le
    // supprimerait silencieusement (ex. "0700000000" → 700000000).
    const { data, error } = await supabase
      .from("parametres_globaux")
      .update({
        wave_qr_url: waveQrDraft.trim() || null,
        wave_telephone: waveTelDraft.trim() || null,
        abonnement_prix: prix,
      })
      .eq("id", parametresGlobaux.id)
      .select()
      .single();
    if (error) {
      setWaveMsg(t("common.error", { message: error.message }));
      return;
    }
    setParametresGlobaux(data);
    setWaveMsg(t("admin.waveSavedMsg"));
  }

  async function enregistrerSupport() {
    if (!parametresGlobaux) return;
    // Même remarque que wave_telephone : chaîne de caractères, jamais
    // Number(...), pour ne jamais perdre le 0 initial d'un numéro local.
    const { data, error } = await supabase
      .from("parametres_globaux")
      .update({ support_telephone: supportTelDraft.trim() || null })
      .eq("id", parametresGlobaux.id)
      .select()
      .single();
    if (error) {
      setSupportMsg(t("common.error", { message: error.message }));
      return;
    }
    setParametresGlobaux(data);
    setSupportMsg(t("admin.supportSavedMsg"));
  }

  function nomBoutique(businessId) {
    return businesses.find((x) => x.id === businessId)?.name || t("common.defaultBusinessName");
  }

  const maintenant = new Date();
  const revenuTotal = paiementsReussis.reduce((s, p) => s + p.montant, 0);
  const revenuMoisCourant = paiementsReussis
    .filter((p) => {
      if (!p.valide_at) return false;
      const d = new Date(p.valide_at);
      return d.getMonth() === maintenant.getMonth() && d.getFullYear() === maintenant.getFullYear();
    })
    .reduce((s, p) => s + p.montant, 0);
  const nbAbonnesActifs = businesses.filter((b) => b.subscription_status === "actif").length;
  const nbEnEssai = businesses.filter((b) => b.subscription_status === "essai").length;

  const moisBucketsRevenus = buildMonthlyBucketsRevenus(paiementsReussis, business?.langue);
  const semaineBucketsRevenus = buildSemainesRevenus(paiementsReussis, t);
  const chartDataRevenus = periodeRevenu === "mois" ? semaineBucketsRevenus : moisBucketsRevenus.slice(-PERIODE_MOIS[periodeRevenu]);
  const aucuneDonneeRevenu = chartDataRevenus.every((b) => b.montant === 0);

  // Le paiement le plus récent en premier par défaut (triDateAsc = false) —
  // l'en-tête "Date de validation" du tableau permet d'inverser l'ordre.
  const paiementsTries = [...paiementsReussis].sort((a, b) => {
    const da = new Date(a.valide_at || a.created_at);
    const db = new Date(b.valide_at || b.created_at);
    return triDateAsc ? da - db : db - da;
  });

  function exporterRevenusExcel() {
    const rows = paiementsTries.map((p) => ({
      [t("admin.revenus.colBoutique")]: nomBoutique(p.business_id),
      [t("admin.revenus.colMontant")]: p.montant,
      [t("admin.revenus.colDateValidation")]: p.valide_at ? new Date(p.valide_at).toLocaleDateString(dateLocale(business?.langue)) : "—",
    }));
    exportToExcel(`revenus-doka-${dateFichier()}.xlsx`, "Revenus", rows);
  }

  function imprimerRevenus() {
    const original = document.title;
    document.title = t("admin.revenus.rapportTitle");
    const restore = () => {
      document.title = original;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  if (!business?.is_admin) return null;
  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  return (
    <div>
      <h1 className="sb-h1">{t("admin.title")}</h1>
      <p className="sb-sub">{t("admin.subtitleCount", { n: businesses.length })}</p>

      {/* Accès permanent (toujours visible, pas seulement quand il y a
          quelque chose à vérifier) — aussi la cible de la notification
          push reçue à chaque nouveau justificatif, quand elle ne peut pas
          pointer directement sur la fiche concernée (voir
          app/api/push-admin-paiement). */}
      <Link href="/admin/paiements" className="sb-btn sb-btn-primary sb-paiements-attente-btn">
        <Bell size={15} /> {t("admin.paiementsEnAttenteTitle")}
        {paiementsEnAttente.length > 0 && <span className="sb-btn-count-badge">{paiementsEnAttente.length}</span>}
      </Link>

      {msg && (
        <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
          {msg}
        </div>
      )}

      <div className="sb-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <div>
            <div className="sb-section-title" style={{ margin: 0 }}>
              {t("admin.revenus.title")}
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 0" }}>{t("admin.revenus.subtitle")}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="sb-btn sb-btn-ghost" onClick={exporterRevenusExcel}>
              <FileSpreadsheet size={13} /> {t("common.exporterExcel")}
            </button>
            <button className="sb-btn sb-btn-primary" onClick={imprimerRevenus}>
              <Printer size={13} /> {t("admin.revenus.imprimerPdf")}
            </button>
          </div>
        </div>

        <div className="sb-grid-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="sb-card">
            <div className="sb-stat-label">{t("admin.revenus.revenuTotal")}</div>
            <div className="sb-stat-value" style={{ color: accent }}>
              {fmt(revenuTotal)}
            </div>
          </div>
          <div className="sb-card">
            <div className="sb-stat-label">{t("admin.revenus.revenuMois")}</div>
            <div className="sb-stat-value" style={{ color: "var(--emerald)" }}>
              {fmt(revenuMoisCourant)}
            </div>
          </div>
          <div className="sb-card">
            <div className="sb-stat-label">{t("admin.revenus.abonnesActifs")}</div>
            <div className="sb-stat-value">{nbAbonnesActifs}</div>
          </div>
          <div className="sb-card">
            <div className="sb-stat-label">{t("admin.revenus.enEssai")}</div>
            <div className="sb-stat-value">{nbEnEssai}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 14px", flexWrap: "wrap", gap: 10 }}>
          <div className="sb-section-title" style={{ margin: 0, fontSize: 13 }}>
            {t("admin.revenus.evolutionTitle")}
          </div>
          <div className="sb-toggle-group">
            {["mois", "trimestre", "semestre", "annee"].map((key) => (
              <button
                key={key}
                className={`sb-toggle-item${periodeRevenu === key ? " active" : ""}`}
                onClick={() => setPeriodeRevenu(key)}
              >
                {t(`admin.revenus.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {aucuneDonneeRevenu ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("admin.revenus.aucuneDonnee")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartDataRevenus}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                formatter={(v) => fmt(v)}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)" }}
              />
              <Bar dataKey="montant" name="montant" fill={accent} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        <div className="sb-section-title" style={{ marginTop: 20 }}>
          {t("admin.revenus.tableTitle")}
        </div>
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th>{t("admin.revenus.colBoutique")}</th>
                <th>{t("admin.revenus.colMontant")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => setTriDateAsc((s) => !s)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {t("admin.revenus.colDateValidation")} <ArrowUpDown size={12} />
                  </span>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paiementsTries.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: "var(--muted)" }}>
                    {t("admin.revenus.aucunPaiement")}
                  </td>
                </tr>
              ) : (
                paiementsTries.map((p) => (
                  <tr key={p.id}>
                    <td>{nomBoutique(p.business_id)}</td>
                    <td className="sb-mono">{fmt(p.montant)}</td>
                    <td>{p.valide_at ? new Date(p.valide_at).toLocaleDateString(dateLocale(business?.langue)) : "—"}</td>
                    <td>
                      <button
                        className="sb-btn sb-btn-ghost"
                        style={{ padding: "4px 8px", color: "var(--coral)" }}
                        onClick={() => supprimerPaiement(p)}
                      >
                        <Trash2 size={12} /> {t("admin.revenus.supprimer")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sb-card" style={{ marginBottom: 16, maxWidth: 420 }}>
        <div className="sb-section-title" style={{ margin: "0 0 4px" }}>
          {t("admin.logoTitle")}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("admin.logoSub")}</p>
        <LogoPlatformUpload
          label={t("admin.logoLabel")}
          businessId={business.id}
          value={parametresGlobaux?.logo_url || ""}
          onChange={enregistrerLogoPlatform}
        />
        {logoMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginTop: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {logoMsg}
          </div>
        )}
      </div>

      <div className="sb-card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <div className="sb-section-title">{t("admin.waveTitle")}</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("admin.waveSub")}</p>
        {waveMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {waveMsg}
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <ImageUploadField
            label={t("admin.waveQrLabel")}
            businessId={business.id}
            folder="wave-qr"
            value={waveQrDraft}
            onChange={(url) => {
              setWaveQrDraft(url);
              setWaveMsg("");
            }}
          />
        </div>
        <div className="sb-form-grid">
          <div className="sb-field">
            <label>{t("admin.waveTelLabel")}</label>
            <input
              className="sb-input"
              type="tel"
              placeholder={t("admin.waveTelPlaceholder")}
              value={waveTelDraft}
              onChange={(e) => {
                setWaveTelDraft(e.target.value);
                setWaveMsg("");
              }}
            />
          </div>
          <div className="sb-field">
            <label>{t("admin.wavePrixLabel")}</label>
            <input
              className="sb-input"
              type="number"
              placeholder={t("admin.wavePrixPlaceholder")}
              value={prixDraft}
              onChange={(e) => {
                setPrixDraft(e.target.value);
                setWaveMsg("");
              }}
            />
          </div>
        </div>
        <button className="sb-btn sb-btn-primary" style={{ marginTop: 12 }} onClick={enregistrerParametresGlobaux}>
          {t("parametres.enregistrer")}
        </button>
      </div>

      <div className="sb-card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <div className="sb-section-title">{t("admin.supportTitle")}</div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{t("admin.supportSub")}</p>
        {supportMsg && (
          <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
            {supportMsg}
          </div>
        )}
        {!parametresGlobaux?.support_telephone && (
          <div className="sb-badge sb-badge-amber" style={{ display: "block", marginBottom: 12, fontSize: 12.5, padding: "8px 12px" }}>
            {t("admin.supportTelMissing")}
          </div>
        )}
        <div className="sb-field">
          <label>{t("admin.supportTelLabel")}</label>
          <input
            className="sb-input"
            type="tel"
            placeholder={t("admin.supportTelPlaceholder")}
            value={supportTelDraft}
            onChange={(e) => {
              setSupportTelDraft(e.target.value);
              setSupportMsg("");
            }}
          />
        </div>
        <button className="sb-btn sb-btn-primary" style={{ marginTop: 12 }} onClick={enregistrerSupport}>
          {t("parametres.enregistrer")}
        </button>
      </div>

      {businesses.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--muted)" }}>{t("admin.aucunCommercant")}</p>
      ) : (
        <div className="sb-card">
          <div className="sb-section-title" style={{ marginBottom: 12 }}>
            {t("admin.title")}
          </div>
          <div className="sb-table-scroll">
            <table className="sb-table">
              <thead>
                <tr>
                  <th>{t("admin.colBoutique")}</th>
                  <th>{t("admin.colEmail")}</th>
                  <th>{t("admin.colStatut")}</th>
                  <th>{t("admin.colExpiration")}</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((b) => {
                  // La date d'expiration ne concerne jamais l'admin connecté
                  // lui-même (accès permanent, quel que soit son abonnement) :
                  // elle ne doit apparaître que pour les autres commerçants
                  // listés, jamais comme information personnelle le concernant.
                  const estMoi = b.owner_id === business.owner_id;
                  return (
                    <tr
                      key={b.id}
                      className="sb-row-clickable"
                      onClick={() => router.push(`/admin/commercants/${b.id}`)}
                      style={expireBientot(b) && !estMoi ? { background: "var(--amber-bg)" } : undefined}
                    >
                      <td>{b.name || t("common.defaultBusinessName")}</td>
                      <td style={{ color: "var(--muted)" }}>{b.email || "—"}</td>
                      <td>
                        <span className={`sb-badge ${STATUT_BADGE_CLASS[b.subscription_status] || "sb-badge-amber"}`}>
                          {t(`common.subscriptionStatus.${b.subscription_status}`)}
                        </span>
                      </td>
                      <td>
                        {estMoi ? (
                          <span style={{ color: "var(--text-faint)" }}>{t("admin.aucuneExpiration")}</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span>
                              {b.subscription_expires_at
                                ? new Date(b.subscription_expires_at).toLocaleDateString(dateLocale(business?.langue))
                                : t("admin.aucuneExpiration")}
                            </span>
                            {expireBientot(b) && <span className="sb-badge sb-badge-amber">{t("admin.badgeExpireBientot")}</span>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mise en page dédiée à l'impression du rapport de revenus — même
          principe que components/Receipt.js et tresorerie/page.js : rendue
          via un portail directement dans <body>, invisible à l'écran. */}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="sb-revenus-print">
            <div className="sb-revenus-print-header">
              <div className="sb-revenus-print-brand">
                {parametresGlobaux?.logo_url ? (
                  <img src={parametresGlobaux.logo_url} alt="Doka" />
                ) : (
                  <div className="sb-revenus-print-logo-fallback">DK</div>
                )}
                <span className="sb-revenus-print-brand-name">Doka</span>
              </div>
              <div className="sb-revenus-print-title">
                <h1>{t("admin.revenus.rapportTitle")}</h1>
                <p>
                  {maintenant.toLocaleDateString(dateLocale(business?.langue), { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            <div className="sb-revenus-print-totals">
              <div>
                <div className="label">{t("admin.revenus.revenuTotal")}</div>
                <div className="value">{fmt(revenuTotal)}</div>
              </div>
              <div>
                <div className="label">{t("admin.revenus.revenuMois")}</div>
                <div className="value">{fmt(revenuMoisCourant)}</div>
              </div>
              <div>
                <div className="label">{t("admin.revenus.abonnesActifs")}</div>
                <div className="value">{nbAbonnesActifs}</div>
              </div>
              <div>
                <div className="label">{t("admin.revenus.enEssai")}</div>
                <div className="value">{nbEnEssai}</div>
              </div>
            </div>

            <table className="sb-revenus-print-table">
              <thead>
                <tr>
                  <th>{t("admin.revenus.colBoutique")}</th>
                  <th>{t("admin.revenus.colMontant")}</th>
                  <th>{t("admin.revenus.colDateValidation")}</th>
                </tr>
              </thead>
              <tbody>
                {paiementsTries.map((p) => (
                  <tr key={p.id}>
                    <td>{nomBoutique(p.business_id)}</td>
                    <td>{fmt(p.montant)}</td>
                    <td>{p.valide_at ? new Date(p.valide_at).toLocaleDateString(dateLocale(business?.langue)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
          document.body
        )}
    </div>
  );
}
