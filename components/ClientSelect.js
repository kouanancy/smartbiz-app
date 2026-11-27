"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

// Initiales affichées à la place d'une photo (les clients n'en ont pas,
// contrairement aux articles) — deux premières lettres du prénom si un
// seul mot, sinon une lettre de chacun des deux premiers mots.
function initiales(nom) {
  const mots = (nom || "").trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

// Sélecteur de client existant avec recherche (nom ou téléphone) —
// même composant/panneau que ArticleSelect (voir app/globals.css,
// classes .sb-search-select-*), avec deux différences propres au choix
// d'un client : une fois sélectionné, le champ de recherche est remplacé
// par une carte compacte (nom + téléphone) avec un bouton "Changer" pour
// rouvrir la recherche (plutôt que de rester éditable comme pour un
// article) ; et les clients désactivés (estProposable) ne sont jamais
// proposés dans les suggestions, qu'ils soient listés ou non dans
// `clients` — seule leur présence éventuelle permet à `value` de rester
// affiché correctement si le client déjà choisi a été désactivé depuis
// (voir app/(app)/commandes/[id]/page.js, modale de modification).
export default function ClientSelect({
  clients,
  value,
  onChange,
  estProposable = (c) => c.actif !== false,
  placeholder,
  emptyLabel,
  changerLabel,
  onNouveauClient,
  nouveauClientLabel,
}) {
  const [open, setOpen] = useState(false);
  const [recherche, setRecherche] = useState(!value);
  const [query, setQuery] = useState("");
  const [lastValue, setLastValue] = useState(value);
  const ref = useRef(null);
  const selected = clients.find((c) => c.id === value);
  // Carte "sélectionné" uniquement si le client référencé par `value`
  // est réellement trouvé dans `clients` — sinon (donnée manquante),
  // on retombe sur la recherche plutôt que d'afficher une carte vide.
  const afficherSelection = !recherche && !!selected;

  // Même principe que ArticleSelect : resynchronisé uniquement quand la
  // sélection change réellement depuis l'extérieur (value), jamais
  // pendant la frappe. Un changement externe de value (nouvelle
  // commande réinitialisée après enregistrement, nouveau client créé
  // puis auto-sélectionné...) rouvre ou referme la carte "sélectionné"
  // selon qu'une valeur existe désormais ou non.
  if (value !== lastValue) {
    setLastValue(value);
    setRecherche(!value);
    setQuery("");
  }

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        // Une recherche abandonnée sans choisir revient à la carte du
        // client déjà sélectionné (si existant) plutôt que de laisser
        // la recherche ouverte sans résultat choisi.
        if (value) setRecherche(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [value]);

  const resultats = useMemo(() => {
    const proposables = clients.filter(estProposable);
    const q = query.trim().toLowerCase();
    if (!q) return proposables;
    const qTel = q.replace(/\D/g, "");
    return proposables.filter((c) => {
      const nomMatch = c.nom?.toLowerCase().includes(q);
      const telMatch = qTel && c.telephone?.replace(/\D/g, "").includes(qTel);
      return nomMatch || telMatch;
    });
  }, [clients, estProposable, query]);

  function selectionner(c) {
    onChange(c.id);
    setRecherche(false);
    setQuery("");
    setOpen(false);
  }

  function changer() {
    setRecherche(true);
    setQuery("");
    setOpen(true);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
      if (value) setRecherche(false);
      setQuery("");
    } else if (e.key === "Enter") {
      e.preventDefault();
      const premier = resultats[0];
      if (premier) selectionner(premier);
    }
  }

  return (
    <div className="sb-search-select" ref={ref}>
      {afficherSelection ? (
        <div className="sb-input sb-search-select-selected">
          <span className="sb-search-select-thumb">
            <span className="sb-search-select-thumb-initiales">{initiales(selected.nom)}</span>
          </span>
          <span className="sb-search-select-item-info">
            <span className="sb-search-select-item-nom">{selected.nom}</span>
            <span className="sb-search-select-item-tel">{selected.telephone}</span>
          </span>
          <button type="button" className="sb-btn sb-btn-ghost sb-search-select-selected-changer" onClick={changer}>
            {changerLabel}
          </button>
        </div>
      ) : (
        <>
          <div className="sb-input sb-search-select-trigger">
            <span className="sb-search-select-thumb">
              <Search size={14} />
            </span>
            <input
              type="text"
              className="sb-search-select-input"
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
            <div className="sb-search-select-panel">
              {resultats.length === 0 ? (
                <>
                  <p className="sb-search-select-empty">{emptyLabel}</p>
                  {onNouveauClient && (
                    <button
                      type="button"
                      className="sb-search-select-empty-action"
                      onClick={() => {
                        setOpen(false);
                        onNouveauClient();
                      }}
                    >
                      {nouveauClientLabel}
                    </button>
                  )}
                </>
              ) : (
                resultats.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`sb-search-select-item${c.id === value ? " active" : ""}`}
                    onClick={() => selectionner(c)}
                  >
                    <span className="sb-search-select-thumb">
                      <span className="sb-search-select-thumb-initiales">{initiales(c.nom)}</span>
                    </span>
                    <span className="sb-search-select-item-info">
                      <span className="sb-search-select-item-nom">{c.nom}</span>
                      <span className="sb-search-select-item-tel">{c.telephone}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
