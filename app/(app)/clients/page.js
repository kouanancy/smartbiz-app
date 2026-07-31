"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Pencil, Plus, RotateCcw, Search, Trash2, UserX, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt as fmtBase } from "@/lib/format";
import { t as tBase } from "@/lib/i18n";
import { exportToExcel, dateFichier } from "@/lib/exportExcel";

const normalizeTel = (tel) => (tel || "").replace(/\D/g, "");

export default function ClientsPage() {
  const { business } = useAuth();
  const fmt = (n) => fmtBase(n, business?.devise);
  const t = (key, vars) => tBase(business?.langue, key, vars);
  const [clients, setClients] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: "", adresse: "", email: "", telephone: "" });
  const [erreurTel, setErreurTel] = useState(false);
  const [msg, setMsg] = useState("");
  const [showDesactives, setShowDesactives] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ nom: "", adresse: "", email: "", telephone: "" });
  const [editOriginalTelephone, setEditOriginalTelephone] = useState("");
  const [editErreurTel, setEditErreurTel] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      setLoading(true);
      const [clientsRes, commandesRes] = await Promise.all([
        supabase.from("clients").select("*").eq("business_id", business.id).order("nom"),
        supabase.from("commandes").select("client_id, ca").eq("business_id", business.id),
      ]);
      if (!active) return;
      setClients(clientsRes.data || []);
      setCommandes(commandesRes.data || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  const stats = (id) => {
    const own = commandes.filter((c) => c.client_id === id);
    return { count: own.length, total: own.reduce((s, c) => s + c.ca, 0) };
  };
  const filtered = clients.filter((c) => {
    if (!showDesactives && c.actif === false) return false;
    return c.nom.toLowerCase().includes(q.toLowerCase());
  });

  // Un même numéro de téléphone ne doit pas être partagé par deux clients de
  // la boutique. excludeId permet d'ignorer le client lui-même lors d'une
  // modification.
  function trouverDoublonTelephone(telephone, excludeId) {
    const norm = normalizeTel(telephone);
    if (!norm) return null;
    return clients.find((c) => c.id !== excludeId && normalizeTel(c.telephone) === norm) || null;
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
    setClients((prev) => [...prev, data].sort((a, b) => a.nom.localeCompare(b.nom)));
    setMsg(t("clients.savedSuccess", { nom: data.nom || t("clients.defaultNom") }));
    setForm({ nom: "", adresse: "", email: "", telephone: "" });
    setShowForm(false);
  }

  function ouvrirEdition(client) {
    setEditingId(client.id);
    setEditForm({
      nom: client.nom || "",
      adresse: client.adresse || "",
      email: client.email || "",
      telephone: client.telephone || "",
    });
    setEditOriginalTelephone(client.telephone || "");
    setEditErreurTel(false);
    setEditError("");
  }

  async function validerEdition(e) {
    e.preventDefault();
    if (!editForm.telephone.trim()) {
      setEditErreurTel(true);
      return;
    }
    setEditErreurTel(false);

    const telephoneChange = normalizeTel(editForm.telephone) !== normalizeTel(editOriginalTelephone);
    if (telephoneChange) {
      const doublon = trouverDoublonTelephone(editForm.telephone, editingId);
      if (doublon) {
        setEditError(t("clients.duplicatePhoneNoPrefix", { nom: doublon.nom || t("clients.autreClientCap") }));
        return;
      }
    }

    const { data, error } = await supabase
      .from("clients")
      .update({
        nom: editForm.nom.trim(),
        adresse: editForm.adresse.trim() || null,
        email: editForm.email.trim() || null,
        telephone: editForm.telephone.trim(),
      })
      .eq("id", editingId)
      .select()
      .single();
    if (error) {
      setEditError(error.message);
      return;
    }
    setClients((prev) => prev.map((c) => (c.id === editingId ? data : c)).sort((a, b) => a.nom.localeCompare(b.nom)));
    setEditingId(null);
  }

  async function desactiverClient(client) {
    const { data, error } = await supabase.from("clients").update({ actif: false }).eq("id", client.id).select().single();
    if (error) {
      window.alert(t("clients.desactiverError", { message: error.message }));
      return;
    }
    setClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
  }

  async function reactiverClient(client) {
    const { data, error } = await supabase.from("clients").update({ actif: true }).eq("id", client.id).select().single();
    if (error) {
      window.alert(t("clients.reactiverError", { message: error.message }));
      return;
    }
    setClients((prev) => prev.map((c) => (c.id === client.id ? data : c)));
  }

  async function supprimerClient(client) {
    const confirmed = window.confirm(t("clients.confirmDelete", { nom: client.nom }));
    if (!confirmed) return;
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      if (error.code === "23503") {
        window.alert(t("clients.deleteLinkedError", { nom: client.nom }));
      } else {
        window.alert(t("clients.deleteGenericError", { message: error.message }));
      }
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== client.id));
  }

  function exporterExcel() {
    const rows = filtered.map((c) => {
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="sb-h1">{t("clients.title")}</h1>
          <p className="sb-sub">{t("clients.subtitleCount", { n: clients.length })}</p>
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
            <input
              className="sb-input"
              placeholder={t("clients.nomPlaceholder")}
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
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
              style={erreurTel ? { borderColor: "#C24E37" } : undefined}
            />
            <p style={{ fontSize: 11, color: erreurTel ? "#C24E37" : "#6E6B68", margin: "5px 2px 0" }}>
              {erreurTel ? t("clients.telephoneRequiredError") : t("clients.telephoneHint")}
            </p>
          </div>
          <button className="sb-btn sb-btn-emerald" type="submit" style={{ gridColumn: "1 / 3", justifyContent: "center" }}>
            <CheckCircle2 size={14} /> {t("clients.saveClient")}
          </button>
        </form>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ position: "relative", maxWidth: 280, flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#6B6A63" }} />
          <input
            className="sb-input"
            style={{ paddingLeft: 30 }}
            placeholder={t("clients.searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#6E6B68", cursor: "pointer" }}>
          <input type="checkbox" checked={showDesactives} onChange={(e) => setShowDesactives(e.target.checked)} />
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const s = stats(c.id);
                const desactive = c.actif === false;
                return (
                  <tr key={c.id}>
                    <td>{c.nom}</td>
                    <td style={{ color: "#6B6A63" }}>{c.telephone}</td>
                    <td style={{ color: "#6B6A63" }}>{c.adresse || "—"}</td>
                    <td style={{ color: "#6B6A63" }}>{c.email || "—"}</td>
                    <td className="sb-mono">{s.count}</td>
                    <td className="sb-mono">{fmt(s.total)}</td>
                    <td>
                      {desactive ? (
                        <span className="sb-badge sb-badge-amber">{t("common.badgeDesactive")}</span>
                      ) : (
                        <span className="sb-badge sb-badge-emerald">{t("common.badgeActif")}</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => ouvrirEdition(c)}>
                          <Pencil size={12} /> {t("clients.modifier")}
                        </button>
                        {desactive ? (
                          <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => reactiverClient(c)}>
                            <RotateCcw size={12} /> {t("clients.reactiver")}
                          </button>
                        ) : s.count === 0 ? (
                          <button
                            className="sb-btn sb-btn-ghost"
                            style={{ padding: "4px 8px", color: "#C24E37" }}
                            onClick={() => supprimerClient(c)}
                          >
                            <Trash2 size={12} /> {t("clients.supprimer")}
                          </button>
                        ) : (
                          <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => desactiverClient(c)}>
                            <UserX size={12} /> {t("clients.desactiver")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingId && (
        <div className="sb-modal-overlay" onClick={() => setEditingId(null)}>
          <div className="sb-card" style={{ width: 380, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div className="sb-section-title" style={{ margin: 0 }}>
                {t("clients.editModalTitle")}
              </div>
              <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={validerEdition} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              <div className="sb-field">
                <label>{t("clients.nomLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("clients.nomPlaceholder")}
                  value={editForm.nom}
                  onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
                />
              </div>
              <div className="sb-field">
                <label>{t("clients.adresseLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("clients.adressePlaceholder")}
                  value={editForm.adresse}
                  onChange={(e) => setEditForm({ ...editForm, adresse: e.target.value })}
                />
              </div>
              <div className="sb-field">
                <label>{t("clients.emailLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("clients.emailPlaceholder")}
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="sb-field">
                <label>{t("clients.telephoneLabel")}</label>
                <input
                  className="sb-input"
                  placeholder={t("clients.telephonePlaceholder")}
                  value={editForm.telephone}
                  onChange={(e) => {
                    setEditForm({ ...editForm, telephone: e.target.value });
                    if (editErreurTel) setEditErreurTel(false);
                  }}
                  style={editErreurTel ? { borderColor: "#C24E37" } : undefined}
                />
                <p style={{ fontSize: 11, color: editErreurTel ? "#C24E37" : "#6E6B68", margin: "5px 2px 0" }}>
                  {editErreurTel ? t("clients.telephoneRequiredError") : t("clients.telephoneHint")}
                </p>
              </div>
              {editError && <p style={{ fontSize: 12, color: "#C24E37", margin: 0 }}>{editError}</p>}
              <button className="sb-btn sb-btn-emerald" type="submit" style={{ justifyContent: "center" }}>
                <CheckCircle2 size={14} /> {t("clients.saveEdits")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
