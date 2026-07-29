import fr from "./fr";
import en from "./en";

const DICTS = { fr, en };

export const LANGUES = ["fr", "en"];

function resolve(dict, key) {
  return key.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), dict);
}

// t(lang, "namespace.cle", vars) — vars est passé tel quel à une entrée
// fonction (pour les pluriels/phrases dynamiques) ou sert au remplacement
// de {{placeholders}} dans une entrée chaîne.
export function t(lang, key, vars) {
  const dict = DICTS[lang] || DICTS.fr;
  let entry = resolve(dict, key);
  if (entry === undefined) entry = resolve(DICTS.fr, key);
  if (typeof entry === "function") return entry(vars);
  if (typeof entry === "string" && vars) {
    return Object.keys(vars).reduce((s, k) => s.replaceAll(`{{${k}}}`, vars[k]), entry);
  }
  return entry ?? key;
}
