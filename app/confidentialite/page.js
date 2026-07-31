import fs from "fs";
import path from "path";
import LegalDocument from "@/components/LegalDocument";
import LegalBackLink from "@/components/LegalBackLink";

export const metadata = {
  title: "Politique de Confidentialité — Doka",
  description: "Politique de Confidentialité de Doka.",
};

export default function ConfidentialitePage() {
  const content = fs.readFileSync(path.join(process.cwd(), "doka-politique-confidentialite.md"), "utf-8");
  return (
    <div className="sb-legal-screen">
      <div className="sb-legal-card">
        <LegalBackLink />
        <LegalDocument content={content} />
      </div>
    </div>
  );
}
