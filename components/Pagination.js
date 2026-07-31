"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Navigation page précédente / suivante pour les listes paginées côté
// serveur (Stock, Clients, Commandes) — masquée dès qu'une seule page
// suffit, pour ne pas encombrer l'écran sur une petite boutique.
export default function Pagination({ page, totalPages, onChange, label }) {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: "#6E6B68" }}>{label}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="sb-btn sb-btn-ghost"
          style={{ padding: "6px 10px" }}
          onClick={() => onChange(page - 1)}
          disabled={page === 0}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          className="sb-btn sb-btn-ghost"
          style={{ padding: "6px 10px" }}
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages - 1}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
