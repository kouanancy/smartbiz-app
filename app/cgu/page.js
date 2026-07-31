import fs from "fs";
import path from "path";
import LegalDocument from "@/components/LegalDocument";
import LegalBackLink from "@/components/LegalBackLink";

export const metadata = {
  title: "CGU — Doka",
  description: "Conditions Générales d'Utilisation de Doka.",
};

export default function CguPage() {
  const content = fs.readFileSync(path.join(process.cwd(), "doka-cgu.md"), "utf-8");
  return (
    <div className="sb-legal-screen">
      <div className="sb-legal-card">
        <LegalBackLink />
        <LegalDocument content={content} />
      </div>
    </div>
  );
}
