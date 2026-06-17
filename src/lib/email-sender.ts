// Résolution de l'expéditeur Gmail selon l'utilisateur connecté.
// Partagé entre l'action d'envoi et l'affichage de la fiche.

export type SenderAccount = { from: string; refreshToken: string };

export function resolveSender(userEmail?: string | null): SenderAccount | null {
  const raw = process.env.GOOGLE_SENDERS;
  if (raw) {
    try {
      const list = JSON.parse(raw) as {
        login: string;
        from: string;
        refreshToken: string;
      }[];
      if (userEmail) {
        const m = list.find(
          (s) => s.login?.trim().toLowerCase() === userEmail.trim().toLowerCase(),
        );
        if (m?.from && m?.refreshToken)
          return { from: m.from, refreshToken: m.refreshToken };
        // Adresse connectée connue mais SANS expéditeur dédié : on NE retombe
        // PAS sur un autre compte (jamais envoyer au nom de quelqu'un d'autre).
        return null;
      }
      const first = list[0];
      if (first?.from && first?.refreshToken)
        return { from: first.from, refreshToken: first.refreshToken };
    } catch {
      // JSON invalide → repli sur l'expéditeur unique ci-dessous.
    }
  }
  const from = process.env.GOOGLE_SENDER;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (from && refreshToken) return { from, refreshToken };
  return null;
}

export type SenderEntry = { label: string; from: string; refreshToken: string };

// Tous les comptes d'envoi/lecture configurés (pour lire toutes les boîtes).
export function allSenders(): SenderEntry[] {
  const raw = process.env.GOOGLE_SENDERS;
  if (raw) {
    try {
      const list = JSON.parse(raw) as {
        login: string;
        from: string;
        refreshToken: string;
      }[];
      return list
        .filter((s) => s.from && s.refreshToken)
        .map((s) => ({ label: s.login ?? s.from, from: s.from, refreshToken: s.refreshToken }));
    } catch {
      // JSON invalide → repli ci-dessous.
    }
  }
  const from = process.env.GOOGLE_SENDER;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (from && refreshToken) return [{ label: from, from, refreshToken }];
  return [];
}
