ALTER TABLE "stages" ADD COLUMN "code" text;--> statement-breakpoint
-- Clés stables des étapes existantes (d'après leur nom par défaut).
UPDATE "stages" SET "code" = CASE "nom"
  WHEN 'À traiter' THEN 'a_traiter'
  WHEN 'Pas de réponse' THEN 'pas_de_reponse'
  WHEN 'Rappeler' THEN 'rappeler'
  WHEN 'RDV Téléphonique' THEN 'rdv_telephonique'
  WHEN 'Devis à envoyer' THEN 'devis_a_envoyer'
  WHEN 'Hors Zone KO' THEN 'hors_zone_ko'
  WHEN 'Non qualifié KO' THEN 'non_qualifie_ko'
  WHEN 'Rendez-vous' THEN 'rendez_vous'
  WHEN 'Devis envoyé' THEN 'devis_envoye'
  WHEN 'Signée' THEN 'signee'
  WHEN 'KO' THEN 'ko'
  WHEN 'À métrer' THEN 'a_metrer'
  WHEN 'Métré réalisé' THEN 'metre_realise'
  WHEN 'Commande fournisseur' THEN 'commande_fournisseur'
  WHEN 'En livraison' THEN 'en_livraison'
  WHEN 'Pose planifiée' THEN 'pose_planifiee'
  WHEN 'Posée' THEN 'posee'
  WHEN 'SAV' THEN 'sav'
  WHEN 'Annulée' THEN 'annulee'
  ELSE "code" END
WHERE "code" IS NULL;
