-- Deux champs « acompte » coexistaient : leads.acompte (Suivi commercial, saisi à
-- la main, alimentait le KPI « Encaissé ») et leads.acompte_encaisse (bloc
-- Encaissement, alimentait le reste à encaisser). On garde acompte_encaisse ;
-- l'ancien champ est reporté quand le nouveau est vide, puis supprimé (0027).
UPDATE "leads" SET "acompte_encaisse" = "acompte"
WHERE "acompte_encaisse" IS NULL AND "acompte" IS NOT NULL;
