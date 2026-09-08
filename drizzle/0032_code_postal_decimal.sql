-- Codes postaux reçus en NOMBRE DÉCIMAL (« 11160.0 », « 6600.0 » : formatage
-- Make) : on retire la partie décimale, puis on remet le zéro de tête sur les
-- valeurs à 4 chiffres (même rattrapage que 0031).
UPDATE "leads" SET "code_postal" = regexp_replace("code_postal", '[.,]0+$', '')
WHERE "code_postal" ~ '^[0-9]{4,5}[.,]0+$';
UPDATE "leads" SET "code_postal" = '0' || "code_postal"
WHERE "code_postal" ~ '^[0-9]{4}$';
