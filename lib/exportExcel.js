import * as XLSX from "xlsx";

// Génère et télécharge un fichier .xlsx à partir d'un tableau d'objets
// (une ligne par objet, les clés deviennent les en-têtes de colonne).
// Usage strictement en écriture : on ne relit jamais de fichier importé
// avec cette bibliothèque, donc les failles connues de SheetJS (analyse
// de fichiers non fiables — pollution de prototype, ReDoS) ne s'appliquent
// pas ici.
export function exportToExcel(filename, sheetName, rows) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

// Date du jour au format JJ-MM-AAAA, pour donner un nom de fichier stable
// et lisible (ex. "stock-31-07-2026.xlsx").
export function dateFichier() {
  const d = new Date();
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${jj}-${mm}-${d.getFullYear()}`;
}
