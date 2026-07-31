"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Bouton "Retour" générique plutôt qu'un lien statique : ces pages sont
// atteignables aussi bien depuis la connexion (avant authentification) que
// depuis Paramètres (une fois connecté) — l'historique du navigateur ramène
// toujours au bon endroit sans avoir à deviner la provenance.
export default function LegalBackLink() {
  const router = useRouter();
  return (
    <button type="button" className="sb-legal-back" onClick={() => router.back()}>
      <ArrowLeft size={14} /> Retour
    </button>
  );
}
