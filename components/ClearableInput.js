"use client";

import { X } from "lucide-react";

// <input> avec une croix pour vider le champ en un clic, visible seulement
// quand il contient du texte. leftIcon accepte l'icône de recherche déjà
// utilisée sur certains champs (Articles/Clients) : on ajuste alors le
// padding pour laisser la place aux deux icônes, sans dupliquer le
// positionnement absolu à chaque appel.
export default function ClearableInput({ value, onChange, clearLabel, leftIcon, wrapStyle, className = "sb-input", style, ...props }) {
  const inputStyle = { paddingRight: 28, ...(leftIcon ? { paddingLeft: 30 } : null), ...style };

  return (
    <div className="sb-clearable-wrap" style={wrapStyle}>
      {leftIcon}
      <input {...props} className={className} style={inputStyle} value={value} onChange={onChange} />
      {value && (
        <button
          type="button"
          className="sb-clearable-btn"
          onClick={() => onChange({ target: { value: "" } })}
          aria-label={clearLabel}
          tabIndex={-1}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
