"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt } from "@/lib/format";

export default function ClientsPage() {
  const { business } = useAuth();
  const [clients, setClients] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: "", adresse: "", email: "", telephone: "" });
  const [erreurTel, setErreurTel] = useState(false);
  const [msg, setMsg] = useState("");

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
  const filtered = clients.filter((c) => c.nom.toLowerCase().includes(q.toLowerCase()));

  async function submit(e) {
    e.preventDefault();
    if (!form.telephone.trim()) {
      setErreurTel(true);
      return;
    }
    setErreurTel(false);
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
      setMsg(`Erreur : ${error.message}`);
      return;
    }
    setClients((prev) => [...prev, data].sort((a, b) => a.nom.localeCompare(b.nom)));
    setMsg(`✅ ${data.nom || "Client"} enregistré(e) avec succès`);
    setForm({ nom: "", adresse: "", email: "", telephone: "" });
    setShowForm(false);
  }

  if (loading) return <p className="sb-sub">Chargement…</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="sb-h1">Clients</h1>
          <p className="sb-sub">{clients.length} client(s) enregistré(s)</p>
        </div>
        <button
          className="sb-btn sb-btn-primary"
          onClick={() => {
            setShowForm((s) => !s);
            setMsg("");
          }}
        >
          <Plus size={14} /> Nouveau client
        </button>
      </div>

      {msg && (
        <div className="sb-badge sb-badge-emerald" style={{ marginBottom: 12, fontSize: 12.5, padding: "6px 10px" }}>
          {msg}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="sb-card sb-form-grid" style={{ marginBottom: 18 }}>
          <div className="sb-field" style={{ gridColumn: "1 / 3" }}>
            <label>Nom et prénoms</label>
            <input
              className="sb-input"
              placeholder="Ex. Aïcha Koné"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
            />
          </div>
          <div className="sb-field" style={{ gridColumn: "1 / 3" }}>
            <label>Adresse</label>
            <input
              className="sb-input"
              placeholder="Ex. Cocody, Abidjan"
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label>E-mail (facultatif)</label>
            <input
              className="sb-input"
              placeholder="ex. cliente@example.com"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="sb-field">
            <label>Téléphone</label>
            <input
              className="sb-input"
              placeholder="Ex. 07 01 22 33 44"
              value={form.telephone}
              onChange={(e) => {
                setForm({ ...form, telephone: e.target.value });
                if (erreurTel) setErreurTel(false);
              }}
              style={erreurTel ? { borderColor: "#C24E37" } : undefined}
            />
            <p style={{ fontSize: 11, color: erreurTel ? "#C24E37" : "#6E6B68", margin: "5px 2px 0" }}>
              {erreurTel ? "Le numéro de téléphone est obligatoire." : "Obligatoire — de préférence un numéro WhatsApp."}
            </p>
          </div>
          <button className="sb-btn sb-btn-emerald" type="submit" style={{ gridColumn: "1 / 3", justifyContent: "center" }}>
            <CheckCircle2 size={14} /> Enregistrer le client
          </button>
        </form>
      )}

      <div style={{ position: "relative", marginBottom: 14, maxWidth: 280 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "#6B6A63" }} />
        <input className="sb-input" style={{ paddingLeft: 30 }} placeholder="Rechercher un client" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="sb-card">
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Adresse</th>
                <th>E-mail</th>
                <th>Commandes</th>
                <th>Total achats</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const s = stats(c.id);
                return (
                  <tr key={c.id}>
                    <td>{c.nom}</td>
                    <td style={{ color: "#6B6A63" }}>{c.telephone}</td>
                    <td style={{ color: "#6B6A63" }}>{c.adresse || "—"}</td>
                    <td style={{ color: "#6B6A63" }}>{c.email || "—"}</td>
                    <td className="sb-mono">{s.count}</td>
                    <td className="sb-mono">{fmt(s.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
