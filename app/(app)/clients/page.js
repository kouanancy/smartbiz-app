"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { PAGE_SIZE } from "@/lib/constants";
import { exportToExcel, dateFichier } from "@/lib/exportExcel";
import Pagination from "@/components/Pagination";
import ClearableInput from "@/components/ClearableInput";

const normalizeTel = (tel) => (tel || "").replace(/\D/g, "");

export default function ClientsPage() {
  const { business } = useAuth();
  const router = useRouter();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [clients, setClients] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [commandes, setCommandes] = useState([]);
  const [clientsPourDoublon, setClientsPourDoublon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: "", adresse: "", email: "", telephone: "" });
  const [erreurTel, setErreurTel] = useState(false);
  const [msg, setMsg] = useState("");
  const [showDesactives, setShowDesactives] = useState(false);

  // Recherche tapée au fil de l'eau, requêtée après une courte pause (300 ms)
  // pour ne pas interroger Supabase à chaque frappe — retour à la première
  // page à chaque nouvelle recherche.
  useEffect(() => {
    const id = setTimeout(() => {
      setQDebounced(q.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  // Recherche + "afficher les désactivés" appliqués côté serveur — partagé
  // entre le chargement paginé et l'export Excel, qui doivent respecter le
  // même filtre. actif est traité comme "vrai" tant qu'il n'est pas
  // explicitement à false (anciennes lignes sans valeur), comme avant.
  const appliquerFiltresClients = useCallback(
    (query) => {
      let q2 = query;
      if (!showDesactives) q2 = q2.or("actif.is.null,actif.eq.true");
      if (qDebounced) q2 = q2.ilike("nom", `%${qDebounced}%`);
      return q2;
    },
    [showDesactives, qDebounced]
  );

  // Statistiques par client (nombre de commandes, total des achats) et
  // détection de doublon de téléphone ont besoin de voir TOUTE la
  // boutique, pas seulement la page affichée — chargées à part, une seule
  // fois par boutique (rafraîchies après une mutation de client).
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function loadStatique() {
      const [commandesRes, clientsRes] = await Promise.all([
        supabase.from("commandes").select("client_id, ca").eq("business_id", business.id),
        supabase.from("clients").select("id,nom,telephone").eq("business_id", business.id),
      ]);
      if (!active) return;
      setCommandes(commandesRes.data || []);
      setClientsPourDoublon(clientsRes.data || []);
    }
    loadStatique();
    return () => {
      active = false;
    };
  }, [business?.id, refreshTick]);

  // Page courante des clients, filtrée et recherchée côté serveur.
  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      const { data, count } = await appliquerFiltresClients(
        supabase.from("clients").select("*", { count: "exact" }).eq("business_id", business.id)
      )
        .order("nom")
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (!active) return;
      const total = count || 0;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (page > 0 && page >= totalPages) {
        setPage(totalPages - 1);
        return;
      }
      setClients(data || []);
      setTotalCount(total);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id, page, appliquerFiltresClients, refreshTick]);

  const stats = (id) => {
    const own = commandes.filter((c) => c.client_id === id);
    return { count: own.length, total: own.reduce((s, c) => s + c.ca, 0) };
  };

  // Un même numéro de téléphone ne doit pas être partagé par deux clients de
  // la boutique. excludeId permet d'ignorer le client lui-même lors d'une
  // modification.
  function trouverDoublonTelephone(telephone, excludeId) {
    const norm = normalizeTel(telephone);
    if (!norm) return null;
    return clientsPourDoublon.find((c) => c.id !== excludeId && normalizeTel(c.telephone) === norm) || null;
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.telephone.trim()) {
      setErreurTel(true);
      return;
    }
    setErreurTel(false);
    const doublon = trouverDoublonTelephone(form.telephone, null);
    if (doublon) {
      setMsg(t("clients.duplicatePhone", { nom: doublon.nom || t("clients.autreClient") }));
      return;
    }
    const { data, error } = await supabase
      .from("clients")
      .insert({
        business_id: business.id,
        nom: form.nom.trim(),
        telephone: form.telephone.trim(),
        adresse: form.adresse.trim() || null,
        email: form.email.trim() || null,
      })
      .select()
      .single();
    if (error) {
      setMsg(t("common.error", { message: error.message }));
      return;
    }
    setRefreshTick((t2) => t2 + 1);
    setMsg(t("clients.savedSuccess", { nom: data.nom || t("clients.defaultNom") }));
    setForm({ nom: "", adresse: "", email: "", telephone: "" });
    setShowForm(false);
  }

  // L'export doit couvrir tous les clients filtrés, pas seulement la page
  // affichée à l'écran — nouvelle requête dédiée, sans pagination.
  async function exporterExcel() {
    const { data } = await appliquerFiltresClients(supabase.from("clients").select("*").eq("business_id", business.id)).order("nom");
    const rows = (data || []).map((c) => {
      const s = stats(c.id);
      return {
        [t("clients.colNom")]: c.nom,
        [t("clients.colTelephone")]: c.telephone,
        [t("clients.colAdresse")]: c.adresse || "",
        [t("clients.colEmail")]: c.email || "",
        [t("clients.colCommandes")]: s.count,
        [t("clients.colTotalAchats")]: s.total,
      };
    });
    exportToExcel(`clients-${dateFichier()}.xlsx`, "Clients", rows);
  }

  if (loading) return <p className="sb-sub">{t("common.loading")}</p>;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="sb-h1">{t("clients.title")}</h1>
          <p className="sb-sub">{t("clients.subtitleCount", { n: totalCount })}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="sb-btn sb-btn-ghost" onClick={exporterExcel}>
            <FileSpreadsheet size={14} /> {t("common.exporterExcel")}
          </button>
          <button
            className="sb-btn sb-btn-primary"
            onClick={() => {
              setShowForm((s) => !s);
              setMsg("");
            }}
          >
            <Plus size={14} /> {t("clients.newClient")}
          </button>
        </div>
      </div>

      {msg && (
        <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
          {msg}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="sb-card sb-form-grid" style={{ marginBottom: 18 }}>
          <div className="sb-field" style={{ gridColumn: "1 / 3" }}>
            <label>{t("clients.nomLabel")}</label>
            <ClearableInput
              placeholder={t("clients.nomPlaceholder")}
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              clearLabel={t("common.clearField")}
            />
          </div>
          <div className="sb-field" style={{ gridColumn: "1 / 3" }}>
            <label>{t("clients.adresseLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("clients.adressePlaceholder")}
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label>{t("clients.emailLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("clients.emailPlaceholder")}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label>{t("clients.telephoneLabel")}</label>
            <input
              className="sb-input"
              placeholder={t("clients.telephonePlaceholder")}
              value={form.telephone}
              onChange={(e) => {
                setForm({ ...form, telephone: e.target.value });
                if (erreurTel) setErreurTel(false);
              }}
              style={erreurTel ? { borderColor: "var(--coral)" } : undefined}
            />
            <p style={{ fontSize: 11, color: erreurTel ? "var(--coral)" : "var(--muted)", margin: "5px 2px 0" }}>
              {erreurTel ? t("clients.telephoneRequiredError") : t("clients.telephoneHint")}
            </p>
          </div>
          <button className="sb-btn sb-btn-emerald" type="submit" style={{ gridColumn: "1 / 3", justifyContent: "center" }}>
            <CheckCircle2 size={14} /> {t("clients.saveClient")}
          </button>
        </form>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <ClearableInput
          wrapStyle={{ maxWidth: 280, flex: 1, minWidth: 220 }}
          leftIcon={<Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />}
          placeholder={t("clients.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          clearLabel={t("common.clearField")}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showDesactives}
            onChange={(e) => {
              setShowDesactives(e.target.checked);
              setPage(0);
            }}
          />
          {t("clients.showDisabled")}
        </label>
      </div>

      <div className="sb-card">
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th>{t("clients.colNom")}</th>
                <th>{t("clients.colTelephone")}</th>
                <th>{t("clients.colAdresse")}</th>
                <th>{t("clients.colEmail")}</th>
                <th>{t("clients.colCommandes")}</th>
                <th>{t("clients.colTotalAchats")}</th>
                <th>{t("clients.colStatut")}</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const s = stats(c.id);
                const desactive = c.actif === false;
                return (
                  <tr key={c.id} className="sb-row-clickable" onClick={() => router.push(`/clients/${c.id}`)}>
                    <td>{c.nom}</td>
                    <td style={{ color: "var(--muted)" }}>{c.telephone}</td>
                    <td style={{ color: "var(--muted)" }}>{c.adresse || "—"}</td>
                    <td style={{ color: "var(--muted)" }}>{c.email || "—"}</td>
                    <td className="sb-mono">{s.count}</td>
                    <td className="sb-mono">{fmt(s.total)}</td>
                    <td>
                      {desactive ? (
                        <span className="sb-badge sb-badge-amber">{t("common.badgeDesactive")}</span>
                      ) : (
                        <span className="sb-badge sb-badge-emerald">{t("common.badgeActif")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} label={t("common.pageSur", { page: page + 1, total: totalPages })} />
      </div>
    </div>
  );
}
