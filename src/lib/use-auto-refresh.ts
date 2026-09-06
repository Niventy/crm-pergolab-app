"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Rafraîchit les données serveur de la page à intervalle régulier (onglet
// visible) et au retour sur l'onglet : les déplacements d'un collègue
// apparaissent sans recharger. Léger : un router.refresh(), pas de websocket.
export function useAutoRefresh(intervalMs = 60_000) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, intervalMs]);
}
