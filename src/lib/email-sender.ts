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
