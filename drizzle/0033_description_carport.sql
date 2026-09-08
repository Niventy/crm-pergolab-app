-- Texte type du CARPORT (nouveau modèle du configurateur). Insertion seule :
-- un texte déjà saisi dans Réglages n'est pas écrasé.
INSERT INTO "sur_mesure_mapping" ("composant", "description")
VALUES ('CARPORT', 'CARPORT ALUMINIUM

1. DESCRIPTIF GÉNÉRAL

Carport en aluminium extrudé 6063 T5, résistant à la corrosion, aux intempéries et sans entretien. Disponible en version autoportante (4 poteaux) ou adossée (2 poteaux).

CARACTÉRISTIQUES

•  Poteaux robustes de 150 × 150 mm
•  Couverture étanche en bardage aluminium RHS100 ou RHS130
•  Pose verticale ou horizontale
•  Évacuation des eaux intégrée dans les poteaux
•  Visserie invisible et boulonnerie inox
•  Dimensions personnalisables jusqu''à 6 000 mm de largeur et 3 000 mm de hauteur
•  6 finitions disponibles : blanc, gris foncé, anthracite, noir, chêne ou cèdre
•  Possibilité d''ajouter un espace de stockage fermé à l''arrière
•  Finitions RAL sur mesure disponibles sur demande

DIMENSIONS DE VOTRE CARPORT

•  Largeur : {largeur} mm
•  Profondeur : {profondeur} mm
•  Poteaux : {poteaux}

GARANTIE

•  15 ans sur la structure aluminium')
ON CONFLICT ("composant") DO NOTHING;
