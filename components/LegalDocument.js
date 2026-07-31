import Link from "next/link";
import { MarkdownAsync } from "react-markdown";

// Fait correspondre les liens relatifs vers les fichiers .md sources (ex.
// dans doka-mentions-legales.md : "[Politique de Confidentialité]
// (doka-politique-confidentialite.md)") aux pages réellement servies par
// l'app, pour qu'ils restent cliquables une fois rendus ici.
const MD_TO_ROUTE = {
  "doka-cgu.md": "/cgu",
  "doka-politique-confidentialite.md": "/confidentialite",
  "doka-mentions-legales.md": "/mentions-legales",
};

const COMPONENTS = {
  h1: (props) => <h1 {...props} />,
  h2: (props) => <h2 {...props} />,
  h3: (props) => <h3 {...props} />,
  p: (props) => <p {...props} />,
  ul: (props) => <ul {...props} />,
  ol: (props) => <ol {...props} />,
  li: (props) => <li {...props} />,
  hr: () => <hr />,
  strong: (props) => <strong {...props} />,
  em: (props) => <em {...props} />,
  // Les notes internes destinées à l'éditrice du document (ex. "Note pour
  // toi : ..." dans doka-mentions-legales.md) s'écrivent en blockquote
  // dans les fichiers sources — jamais du contenu à montrer aux
  // utilisateurs, donc on ne les rend pas ici.
  blockquote: () => null,
  a: ({ href, children }) => {
    const interne = href && Object.entries(MD_TO_ROUTE).find(([fichier]) => href.endsWith(fichier));
    if (interne) return <Link href={interne[1]}>{children}</Link>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

export default async function LegalDocument({ content }) {
  return (
    <div className="sb-legal-content">
      <MarkdownAsync components={COMPONENTS}>{content}</MarkdownAsync>
    </div>
  );
}
