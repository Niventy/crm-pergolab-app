-- Codes postaux reçus en NOMBRE (Meta / Make) : le zéro de tête a sauté
-- (« 06000 » stocké « 6000 » → département 60 au lieu de 06). Un CP français
-- fait 5 chiffres : on remet le zéro sur les valeurs à 4 chiffres.
UPDATE "leads" SET "code_postal" = '0' || "code_postal"
WHERE "code_postal" ~ '^\d{4}$';
