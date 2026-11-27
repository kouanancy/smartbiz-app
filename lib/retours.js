// Calculs partagés par la page de détail d'une commande (bouton Retour,
// mention Retour partiel/total, liste des retours) et par le formulaire
// de retour (quantité encore retournable par ligne) — jamais dupliqués
// sous une autre forme. `retours` est la liste embarquée par Supabase sur
// une commande (chaque retour avec ses retour_lignes imbriquées).

// Quantité déjà retournée, par commande_ligne_id.
export function quantiteRetourneeParLigne(retours) {
  const map = {};
  (retours || []).forEach((r) => {
    (r.retour_lignes || []).forEach((rl) => {
      map[rl.commande_ligne_id] = (map[rl.commande_ligne_id] || 0) + rl.quantite;
    });
  });
  return map;
}

// Toujours 0 pour une ligne offerte (cadeau) : jamais retournable, quelle
// que soit sa quantité — voir enregistrer_retour() côté base, qui refuse
// ce même cas.
export function quantiteRetournable(ligne, retourneParLigne) {
  if (ligne.offert) return 0;
  return ligne.quantite - (retourneParLigne[ligne.id] || 0);
}

// 'aucun' | 'partiel' | 'total' — les lignes offertes n'entrent jamais
// dans ce calcul (ni au numérateur ni au dénominateur) : une commande
// entièrement composée de cadeaux ne peut jamais être en "retour total"
// pour autant.
export function statutRetourCommande(commande, retourneParLigne) {
  const lignesVendues = (commande.commande_lignes || []).filter((l) => !l.offert);
  if (lignesVendues.length === 0) return "aucun";
  const totalQte = lignesVendues.reduce((s, l) => s + l.quantite, 0);
  const totalRetourne = lignesVendues.reduce((s, l) => s + (retourneParLigne[l.id] || 0), 0);
  if (totalRetourne <= 0) return "aucun";
  if (totalRetourne >= totalQte) return "total";
  return "partiel";
}
