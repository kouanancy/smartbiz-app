"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthProvider";
import { fmt } from "@/lib/format";
import Receipt from "@/components/Receipt";

export default function CommandesPage() {
  const { business } = useAuth();
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    if (!business?.id) return;
    let active = true;
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("commandes")
        .select(
          "*, clients(nom, telephone, adresse, email), commande_lignes(quantite, prix_vente, prix_achat, frais_annexes, articles(nom))"
        )
        .eq("business_id", business.id)
        .order("created_at", { ascending: false });
      if (!active) return;
      setCommandes(data || []);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [business?.id]);

  function reprint(c) {
    setReceipt({
      numero: c.numero,
      created_at: c.created_at,
      client: c.clients,
      lignes: c.commande_lignes.map((l) => ({
        nom: l.articles?.nom ?? "—",
        quantite: l.quantite,
        prix_vente: l.prix_vente,
        prix_achat: l.prix_achat,
        frais_annexes: l.frais_annexes,
      })),
      ca: c.ca,
      livraison_type: c.livraison_type,
      livraison_zone: c.livraison_zone,
      livraison_frais: c.livraison_frais,
      paiement_mode: c.paiement_mode,
      paiement_operateur: c.paiement_operateur,
    });
  }

  if (loading) return <p className="sb-sub">Chargement…</p>;

  return (
    <div>
      <h1 className="sb-h1">Commandes</h1>
      <p className="sb-sub">Historique complet — {commandes.length} commande(s)</p>

      <div className="sb-card">
        <div className="sb-table-scroll">
          <table className="sb-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Date</th>
                <th>Cliente</th>
                <th>Articles</th>
                <th>CA</th>
                <th>Marge réelle</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {commandes.map((c) => (
                <tr key={c.id}>
                  <td className="sb-mono">{c.numero}</td>
                  <td>{new Date(c.created_at).toLocaleDateString("fr-FR")}</td>
                  <td>{c.clients?.nom ?? "—"}</td>
                  <td style={{ color: "#6B6A63", fontSize: 12.5 }}>
                    {c.commande_lignes.map((l) => `${l.articles?.nom ?? "—"} ×${l.quantite}`).join(", ")}
                  </td>
                  <td className="sb-mono">{fmt(c.ca)}</td>
                  <td className="sb-mono" style={{ color: "#0E8F6E" }}>{fmt(c.marge)}</td>
                  <td>
                    <button className="sb-btn sb-btn-ghost" style={{ padding: "4px 8px" }} onClick={() => reprint(c)}>
                      <Printer size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {receipt && <Receipt commande={receipt} business={business} onClose={() => setReceipt(null)} />}
    </div>
  );
}
