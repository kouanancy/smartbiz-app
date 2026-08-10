"use client";

// Boîte de confirmation générique (même habillage que les modales
// Articles/Admin : .sb-modal-overlay + .sb-card, clic à l'extérieur =
// annuler). Utilisée pour la déconnexion — un window.confirm() natif
// aurait suffi côté logique, mais impose les libellés de boutons du
// navigateur ; ici les libellés sont ceux voulus ("Oui, me déconnecter" /
// "Annuler"), donc une modale maison est nécessaire.
export default function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="sb-modal-overlay" onClick={onCancel}>
      <div className="sb-card" style={{ width: 340 }} onClick={(e) => e.stopPropagation()}>
        <div className="sb-section-title" style={{ margin: "0 0 8px" }}>
          {title}
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="sb-btn sb-btn-ghost" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="sb-btn sb-btn-primary" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
