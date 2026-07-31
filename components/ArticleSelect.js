"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Image as ImageIcon } from "lucide-react";

// Sélecteur d'article avec miniature — un <select> natif ne peut pas
// afficher d'image dans ses <option> (limitation HTML universelle), d'où
// ce panneau personnalisé reproduisant la même interaction.
export default function ArticleSelect({ articles, value, onChange, getLabel, isDisabled, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = articles.find((a) => a.id === value);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="sb-article-select" ref={ref}>
      <button type="button" className="sb-input sb-article-select-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="sb-article-select-thumb">
          {selected?.image_url ? <img src={selected.image_url} alt="" /> : <ImageIcon size={14} />}
        </span>
        {selected ? (
          <span className="sb-article-select-label">{getLabel(selected)}</span>
        ) : (
          <span className="sb-article-select-placeholder">{placeholder}</span>
        )}
        <ChevronDown size={14} className="sb-article-select-chevron" />
      </button>
      {open && (
        <div className="sb-article-select-panel">
          {articles.map((a) => (
            <button
              type="button"
              key={a.id}
              className={`sb-article-select-item${a.id === value ? " active" : ""}`}
              disabled={isDisabled(a)}
              onClick={() => {
                onChange(a.id);
                setOpen(false);
              }}
            >
              <span className="sb-article-select-thumb">
                {a.image_url ? <img src={a.image_url} alt="" /> : <ImageIcon size={14} />}
              </span>
              <span className="sb-article-select-label">{getLabel(a)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
