"use client";

import { useEffect, useRef, useState } from "react";

// Largeur réelle (px) d'un élément, mise à jour en continu via
// ResizeObserver — utilisé pour décider si les étiquettes de valeur des
// graphiques (Dashboard, Trésorerie) doivent basculer sur un format
// compact faute de place, un choix qui dépend de la largeur réellement
// disponible à l'écran (mobile vs desktop), pas seulement du nombre de
// barres. 0 tant que la mesure n'a pas encore eu lieu (tout premier
// rendu, avant que le ref ne soit attaché) — les appelants traitent ce
// cas comme "pas encore mesuré", jamais comme "aucune place".
export default function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
