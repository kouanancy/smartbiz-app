// Fond animé façon lampe à lave, partagé par tous les écrans d'entrée
// (connexion/inscription, premier paiement, réabonnement, compte suspendu,
// changement de formule). Purement décoratif (aria-hidden) : six formes
// arrondies distinctes plutôt que deux pseudo-éléments, pour des cycles
// vraiment désynchronisés (voir app/globals.css, .sb-blob-*) — un pseudo-
// élément est limité à ::before/::after, donc à deux formes par écran.
export default function FloatingBlobs() {
  return (
    <div className="sb-blob-field" aria-hidden="true">
      <span className="sb-blob sb-blob-1" />
      <span className="sb-blob sb-blob-2" />
      <span className="sb-blob sb-blob-3" />
      <span className="sb-blob sb-blob-4" />
      <span className="sb-blob sb-blob-5" />
      <span className="sb-blob sb-blob-6" />
    </div>
  );
}
