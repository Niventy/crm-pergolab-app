// Helpers @mentions (purs : utilisables côté serveur ET client).
type Profil = { id: string; nom: string | null; email: string };

// Identifiant court d'un profil (1er mot du nom) pour les @mentions.
export function handleOf(p: Profil): string {
  return (p.nom ?? p.email).trim().split(/[\s(]/)[0];
}
