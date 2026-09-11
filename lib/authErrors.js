// Messages d'erreur Supabase Auth traduits en clair, partagés par tous les
// écrans qui appellent directement l'API Auth (connexion/inscription,
// mot de passe oublié, nouveau mot de passe, changement de mot de passe
// depuis Paramètres) — un seul endroit à mettre à jour si Supabase change
// le texte d'une erreur ou si un nouveau cas apparaît, plutôt que de
// dupliquer cette correspondance dans chaque écran.
export function getAuthErrorMessage(err) {
  const message = typeof err?.message === "string" ? err.message : "";
  const status = err?.status;

  if (message.includes("Invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (message.includes("User already registered")) return "Un compte existe déjà avec cet e-mail.";
  if (message.includes("Email not confirmed"))
    return "Confirme d'abord ton adresse e-mail (lien envoyé à l'inscription).";
  if (message.includes("New password should be different"))
    return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (message.includes("Auth session missing"))
    return "Ta session a expiré — redemande un lien de réinitialisation depuis la page de connexion.";
  if (message.includes("rate limit"))
    return "Trop de tentatives — patiente quelques minutes avant de réessayer.";
  if (message.toLowerCase().includes("password"))
    return "Le mot de passe ne respecte pas les critères requis (6 caractères minimum).";

  // La librairie Supabase renvoie parfois un message vide ou "{}" quand la
  // réponse du serveur ne correspond à aucun format attendu (ex. panne
  // réseau, mauvaise URL de projet, service temporairement indisponible).
  // Dans ce cas on affiche un message clair plutôt que de montrer ce texte
  // brut — le détail exact reste visible dans la console du navigateur.
  const isUnusableMessage = !message || message === "{}" || message === "[object Object]";
  if (isUnusableMessage) {
    return status
      ? `Le service d'authentification est inaccessible ou a répondu de façon inattendue (code ${status}). Réessaie dans un instant.`
      : "Impossible de contacter le service d'authentification. Vérifie ta connexion et réessaie.";
  }

  return message;
}
