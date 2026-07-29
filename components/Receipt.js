"use client";

import { createPortal } from "react-dom";
import { CheckCircle2, MessageCircle, Printer, X } from "lucide-react";
import { fmt } from "@/lib/format";

function toWhatsAppNumber(tel) {
  const digits = (tel || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("225")) return digits;
  if (digits.startsWith("0")) return "225" + digits.slice(1);
  return "225" + digits;
}

export default function Receipt({ commande, business, onClose }) {
  const client = commande.client;
  const totalGeneral = commande.ca + (commande.livraison_frais || 0);
  const businessName = business?.name;
  const logo = business?.logo_url;
  const accent = "#E07A29";
  const dateStr = new Date(commande.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  function envoyerWhatsApp() {
    const numero = toWhatsAppNumber(client?.telephone);
    if (!numero) return;
    const lignesTxt = commande.lignes.map((l) => `- ${l.nom} ×${l.quantite}`).join("\n");
    const message =
      `Bonjour ${client?.nom || ""}, voici la confirmation de votre commande ${commande.numero} chez ${businessName || "SmartBiz"} :\n\n` +
      `${lignesTxt}\n\n` +
      (commande.livraison_frais > 0 ? `Frais de livraison : ${fmt(commande.livraison_frais)}\n` : "") +
      `Total : ${fmt(totalGeneral)}\n\n` +
      `Merci pour votre confiance ! ✅`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <>
      {/* Aperçu à l'écran — fenêtre modale, masquée à l'impression */}
      <div className="sb-modal-overlay sb-no-print" onClick={onClose}>
        <div className="sb-card" style={{ width: 380, background: "#fff" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            {logo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src={logo} alt={businessName || "Logo"} style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover" }} />
                <span className="sb-display" style={{ fontWeight: 700, fontSize: 16 }}>{businessName || "Ma boutique"}</span>
              </div>
            ) : businessName ? (
              <span className="sb-display" style={{ fontWeight: 700, fontSize: 17 }}>{businessName}</span>
            ) : (
              <div className="sb-display" style={{ fontWeight: 700, fontSize: 17 }}>
                Smart<span style={{ color: accent }}>Biz</span>
              </div>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A63" }}>
              <X size={16} />
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#6B6A63", margin: "0 0 14px" }}>Confirmation de commande</p>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: "#6B6A63" }}>N° commande</span>
            <span className="sb-mono">{commande.numero}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: "#6B6A63" }}>Date</span>
            <span>{new Date(commande.created_at).toLocaleDateString("fr-FR")}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 12 }}>
            <span style={{ color: "#6B6A63" }}>Cliente</span>
            <span>{client?.nom ?? "—"}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
            <span style={{ color: "#6B6A63" }}>Livraison</span>
            <span>
              {commande.livraison_type === "livraison"
                ? `${commande.livraison_zone} (${fmt(commande.livraison_frais)})`
                : "Récupération en boutique"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 12 }}>
            <span style={{ color: "#6B6A63" }}>Paiement</span>
            <span>{commande.paiement_mode === "mobile_money" ? commande.paiement_operateur : "À la livraison"}</span>
          </div>

          <div style={{ borderTop: "1px dashed #E4E2D8", borderBottom: "1px dashed #E4E2D8", padding: "10px 0", marginBottom: 12 }}>
            {commande.lignes.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span>{l.nom} ×{l.quantite}</span>
                <span className="sb-mono">{fmt(l.prix_vente * l.quantite)}</span>
              </div>
            ))}
            {commande.livraison_frais > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span>Frais de livraison</span>
                <span className="sb-mono">{fmt(commande.livraison_frais)}</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14.5, marginBottom: 16 }}>
            <span>Total</span>
            <span className="sb-mono">{fmt(totalGeneral)}</span>
          </div>

          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <span className="sb-stamp">
              <CheckCircle2 size={15} /> CONFIRMÉE
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="sb-btn"
              style={{ width: "100%", justifyContent: "center", background: "#25D366", color: "#fff" }}
              onClick={envoyerWhatsApp}
              disabled={!toWhatsAppNumber(client?.telephone)}
            >
              <MessageCircle size={14} /> Envoyer par WhatsApp
            </button>
            <button className="sb-btn sb-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => window.print()}>
              <Printer size={14} /> Imprimer / Télécharger en PDF
            </button>
          </div>

          <p style={{ textAlign: "center", fontSize: 10.5, color: "#A6A29D", margin: "12px 0 0" }}>Propulsé par SmartBiz</p>
        </div>
      </div>

      {/* Mise en page dédiée à l'impression — pleine page A4, invisible à l'écran.
          Rendue via un portail directement dans <body> pour ne dépendre d'aucune
          structure de page parente : le CSS @media print n'a qu'à masquer .sb-root
          et afficher ce bloc. */}
      {createPortal(
        <div className="sb-receipt-print">
          <div className="sb-receipt-print-header">
            <div className="sb-receipt-print-brand">
              {logo ? (
                <img src={logo} alt={businessName || "Logo"} />
              ) : (
                <div className="sb-receipt-print-logo-fallback">{(businessName || "SB").slice(0, 2).toUpperCase()}</div>
              )}
              <span className="sb-receipt-print-brand-name">{businessName || "Ma boutique"}</span>
            </div>
            <div className="sb-receipt-print-title">
              <h1>Confirmation de commande</h1>
              <p>N° {commande.numero}</p>
              <p>{dateStr}</p>
            </div>
          </div>

          <div className="sb-receipt-print-info">
            <div className="sb-receipt-print-info-block">
              <h3>Cliente</h3>
              <div>
                <span>Nom</span>
                <strong>{client?.nom ?? "—"}</strong>
              </div>
              <div>
                <span>Téléphone</span>
                <strong>{client?.telephone ?? "—"}</strong>
              </div>
              <div>
                <span>Adresse</span>
                <strong>{client?.adresse || "—"}</strong>
              </div>
              <div>
                <span>E-mail</span>
                <strong>{client?.email || "—"}</strong>
              </div>
            </div>
            <div className="sb-receipt-print-info-block">
              <h3>Livraison &amp; paiement</h3>
              <div>
                <span>Livraison</span>
                <strong>
                  {commande.livraison_type === "livraison" ? commande.livraison_zone : "Récupération en boutique"}
                </strong>
              </div>
              {commande.livraison_frais > 0 && (
                <div>
                  <span>Frais de livraison</span>
                  <strong>{fmt(commande.livraison_frais)}</strong>
                </div>
              )}
              <div>
                <span>Paiement</span>
                <strong>{commande.paiement_mode === "mobile_money" ? commande.paiement_operateur : "À la livraison"}</strong>
              </div>
            </div>
          </div>

          <table className="sb-receipt-print-table">
            <thead>
              <tr>
                <th>Article</th>
                <th style={{ textAlign: "right" }}>Prix unitaire</th>
                <th style={{ textAlign: "center" }}>Quantité</th>
                <th style={{ textAlign: "right" }}>Sous-total</th>
              </tr>
            </thead>
            <tbody>
              {commande.lignes.map((l, i) => (
                <tr key={i}>
                  <td>{l.nom}</td>
                  <td style={{ textAlign: "right" }}>{fmt(l.prix_vente)}</td>
                  <td style={{ textAlign: "center" }}>{l.quantite}</td>
                  <td style={{ textAlign: "right" }}>{fmt(l.prix_vente * l.quantite)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sb-receipt-print-totals">
            <div>
              <span>Total articles</span>
              <strong>{fmt(commande.ca)}</strong>
            </div>
            {commande.livraison_frais > 0 && (
              <div>
                <span>Frais de livraison</span>
                <strong>{fmt(commande.livraison_frais)}</strong>
              </div>
            )}
            <div className="total">
              <span>Total à payer</span>
              <strong>{fmt(totalGeneral)}</strong>
            </div>
          </div>

          <div className="sb-receipt-print-stamp">
            <span>✓ CONFIRMÉE</span>
          </div>

          <div className="sb-receipt-print-footer">Propulsé par SmartBiz</div>
        </div>,
        document.body
      )}
    </>
  );
}
