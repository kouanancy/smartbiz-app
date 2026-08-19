"use client";

import { useEffect, useRef, useState } from "react";

// Carrousel du visuel de droite du héros (components/LandingPage.js) — un
// fondu automatique entre plusieurs images (vue ordinateur, vue téléphone,
// Doka en situation d'usage...) toutes les quelques secondes. `images` :
// tableau de { src, alt }, chemins sous /public. Tant qu'aucune image
// n'est fournie, LandingPage.js n'affiche pas ce composant et garde
// components/DeviceComposition.js (maquette CSS) à la place.
const INTERVAL_MS = 4200;

export default function HeroCarousel({ images }) {
  const [index, setIndex] = useState(0);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    reduceMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Coupé sous prefers-reduced-motion : un changement d'image automatique
    // et récurrent est exactement le genre de mouvement que ce réglage
    // demande d'éviter — la première image reste affichée, statique.
    if (reduceMotionRef.current || images.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [images.length]);

  return (
    <div className="sb-landing-carousel" aria-hidden="true">
      {images.map((img, i) => (
        <img
          key={img.src}
          src={img.src}
          alt={img.alt || ""}
          className={`sb-landing-carousel-slide${i === index ? " sb-landing-carousel-slide-active" : ""}`}
        />
      ))}
    </div>
  );
}
