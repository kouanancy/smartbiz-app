"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Search } from "lucide-react";

// Sélecteur d'article avec recherche + miniature — un <select> natif ne
// peut ni filtrer en tapant, ni afficher d'image dans ses <option>
// (limitations HTML universelles), d'où ce champ de recherche avec
// suggestions : tape le début du nom pour filtrer la liste en temps réel,
// clique/touche une suggestion pour sélectionner (les deux fonctionnent
// aussi bien à la souris/clavier qu'au tactile).
export default function ArticleSelect({ articles, value, onChange, getLabel, isDisabled, placeholder, emptyLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lastValue, setLastValue] = useState(value);
  const ref = useRef(null);
  const selected = articles.find((a) => a.id === value);

  // Le champ affiche le nom de l'article sélectionné tant que l'utilisateur
  // ne retape pas dedans — resynchronisé uniquement quand la sélection
  // change réellement (value), jamais pendant la frappe elle-même : taper
  // ne change pas value tant qu'aucune suggestion n'a été choisie. Ajustement
  // pendant le rendu (comme lastPathname dans Sidebar.js) plutôt que dans un
  // effect, pour éviter un rendu en cascade.
  if (value !== lastValue) {
    setLastValue(value);
    setQuery(selected ? selected.nom : "");
  }

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        // Si l'utilisateur a tapé sans rien choisir, on revient au nom de
        // l'article toujours sélectionné plutôt que de laisser un texte de
        // recherche orphelin affiché dans le champ.
        setQuery(selected ? selected.nom : "");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [selected]);

  const resultats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) => a.nom.toLowerCase().includes(q));
  }, [articles, query]);

  function selectionner(a) {
    onChange(a.id);
    setQuery(a.nom);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery(selected ? selected.nom : "");
    } else if (e.key === "Enter") {
      e.preventDefault();
      const premier = resultats.find((a) => !isDisabled(a));
      if (premier) selectionner(premier);
    }
  }

  return (
    <div className="sb-article-select" ref={ref}>
      <div className="sb-input sb-article-select-trigger">
        <span className="sb-article-select-thumb">
          {selected?.image_url ? <img src={selected.image_url} alt="" /> : <Search size={14} />}
        </span>
        <input
          type="text"
          className="sb-article-select-input"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <div className="sb-article-select-panel">
          {resultats.length === 0 ? (
            <p className="sb-article-select-empty">{emptyLabel}</p>
          ) : (
            resultats.map((a) => (
              <button
                type="button"
                key={a.id}
                className={`sb-article-select-item${a.id === value ? " active" : ""}`}
                disabled={isDisabled(a)}
                onClick={() => selectionner(a)}
              >
                <span className="sb-article-select-thumb">
                  {a.image_url ? <img src={a.image_url} alt="" /> : <ImageIcon size={14} />}
                </span>
                <span className="sb-article-select-label">{getLabel(a)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
