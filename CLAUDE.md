# CRM Pergolab — Mémoire du projet

> Mis à jour le 05/09/2026 après l'audit `docs/AUDIT-2026-09.md` (7 lots de
> corrections). Ce fichier décrit le CRM TEL QU'IL EST ; le détail des bugs
> corrigés et des décisions est dans l'audit.

## Mission
CRM web pour une petite équipe (2 à 5 personnes : ADV + admin) qui suit des
prospects venant de publicités Meta (Lead Ads) sur un pipeline Kanban, compose
les devis (Pennylane), suit les chantiers signés (métré → pose → SAV), la
facturation (acompte / solde) et les encaissements. Déploiement Vercel.

## Stack imposée (ne pas changer sans demander)
Next.js 16 (App Router, Turbopack) + TypeScript · Tailwind 4 + shadcn/ui (base-ui) ·
Supabase (Postgres + Auth + Storage) · Drizzle ORM (schéma + migrations) ·
dnd-kit (Kanbans) · Recharts · Pennylane API v2 (devis / factures) · Gmail &
Google Calendar en OAuth (refresh token par ADV) · Vercel.

## Règles de travail
1. Travailler par lots ; fin de CHAQUE lot : résumer, `npm run lint` + `npx tsc --noEmit`
   + `npm run build`, puis ARRÊTER et attendre validation.
2. Ne créer AUCUN compte à la place du propriétaire (Supabase, Vercel, Make, Meta, Pennylane).
3. Ne JAMAIS committer de secret (`.env.example` documenté). **Pas de commit / push sans accord.**
4. Toute action destructive (DROP, suppression de données) : confirmation explicite avant.
5. Migrations : `npm run db:generate` (ou `npx drizzle-kit generate --custom --name x` pour du
   SQL de données / RLS), puis `npm run db:migrate`. Ne jamais éditer une migration déjà appliquée.

## Invariants métier (ne pas casser)
- **Argent** : la TVA se calcule LIGNE PAR LIGNE au taux de chaque ligne
  (`src/lib/devis-calc.ts`). Tout TTC (devis, acompte, solde, reste à encaisser)
  en découle. Taux valides : `TVA_OPTIONS` = 20 / 10 / 5,5 / 0 (0 → `exempt` Pennylane).
- **Devis accepté** (`devis.accepte_at`, un seul par fiche) = source du montant
  du lead (`leads.montant` HT, `leads.montant_ttc`), de la facturation et du CA.
  Auto-accepté à la signature s'il est unique ; sinon bouton « Marquer signé ».
  Un devis accepté (ou accepté/signé côté Pennylane) est en lecture seule → « Dupliquer ».
- **Facturation** : acompte saisi en TTC, réparti par taux au prorata du devis ;
  solde = reste par taux avec rappel des acomptes. Base « déjà facturé » =
  factures non `supprimee` (synchronisées avec Pennylane à l'ouverture de la fiche).
- **Encaissement** : base = `montant_ttc` uniquement, jamais le HT. TTC inconnu ⇒
  affiché « TTC ? », jamais « soldé ».
- **Statut dérivé de l'étape** — UNE fonction : `statutPourStage()` (`src/lib/pipeline.ts`) :
  `is_perdue` → perdue ; `is_gagnee` ou cycle 3 → gagnée (collant) ; sinon en cours.
- **Étapes référencées par CLÉ** (`stages.code`, constantes `STAGE`), jamais par nom.
- **« Signée » est une étape de passage** : la fiche démarre le chantier sur la
  1ʳᵉ étape du cycle 3 (`etapeEffective`, `src/lib/pipeline-server.ts`).
- **« Devis envoyé »** est déclenché par l'ENVOI réel (Gmail / Pennylane :
  `marquerDevisEnvoye`), pas par la création du devis.
- **Dates** : mois / jour en heure de Paris (`ymParis`, `ymdParis`, `todayParis`).
- **Pilotage** : volumes (leads reçus, closing, entonnoir) en cohorte par date de
  RÉCEPTION ; argent (CA, marge, panier, objectifs) par date de SIGNATURE.
- **Suppression de fiche** = corbeille (`leads.deleted_at`), admin uniquement ;
  toute requête de listing filtre `isNull(deletedAt)`.
- **RLS** activée sur les 12 tables (`setup-rls.ts` + migration 0022) ; l'app
  passe par Drizzle (connexion directe), la RLS ferme l'API REST anon.

## Pipeline (table `stages`, cycle + code)
CYCLE 1 Prospection : À traiter (`a_traiter`) · Pas de réponse · Rappeler · RDV
Téléphonique · Devis à envoyer · Hors Zone KO (perdue) · Non qualifié KO (perdue).
CYCLE 2 Devis & closing : Rendez-vous · Devis envoyé (`devis_envoye`) · Signée
(`signee`, gagnée, passage) · KO (perdue).
CYCLE 3 Chantier (fiche = CLIENT, statut gagnée) : À métrer (`a_metrer`) · Métré
réalisé · Commande fournisseur · En livraison · Pose planifiée · Posée · SAV ·
Annulée (`annulee`, perdue — commande annulée après signature).
Étape perdue ⇒ raison de perte obligatoire (`leads.raison_perte`).

## Écrans
- **Kanban** (`/kanban`, accueil) : cycles 1 & 2, drag-drop, focus une étape, filtre
  mois, dépôt sur un onglet de cycle. Dépôt sur étape perdue → dialogue raison +
  commentaire ; après un dépôt normal → toast « Commenter ». Auto-refresh 60 s.
- **Liste** (`/liste`) : filtres dans l'URL (cycle, étape, responsable, mois, dépt),
  sélection multiple ; admin : corbeille (restaurer / supprimer définitivement).
- **Clients** (`/clients` Kanban des chantiers, `/clients/tableau`) : un seul statut =
  étape cycle 3 ; l'encaissement (À encaisser / Acompte reçu / Soldé) est un badge +
  filtre (`phases-meta.ts`). Anciens `/clients/facturation|sav` → redirections.
- **Fiche** (`/leads/[id]`) — structure en 3 zones, prospect ET client :
  1. **En-tête** (`fiche-header.tsx`) : nom, badges (Client / Perdu / étape), « Géré
     par », tél (bouton), email, localisation, origine Meta ; puis bandeau de
     situation — prospect : « reçu il y a X · jamais appelé / N appels », RDV,
     relance (rouge si en retard) ; client : signature, argent (barre TTC→encaissé→
     reste + badge), prochaine échéance, poseur. Perdu → bandeau + « Réactiver ».
  2. **Travailler** (colonne gauche 3/5) : actions à un clic (`actions-rapides.tsx` :
     Pas de réponse → étape + relance, Appel passé, RDV fixé → étape Rendez-vous +
     Google Agenda, RDV à reprogrammer, Relance, Devis à envoyer ; client :
     pilules chantier qui datent ET avancent l'étape) · rail d'étapes replié ·
     email · **fil unique** (`fil-activite.tsx` : notes + appels + RDV + étapes +
     devis + paiements, groupé par jour) avec `note-composer.tsx` (@mentions).
  3. **Contexte** (colonne droite 2/5) : autres fiches du même contact (doublons),
     coordonnées & projet éditables en place, **réponses du formulaire Meta**
     (`meta-reponses.tsx`, depuis `raw_payload`), devis, [client : chantier
     `chantier.tsx`, factures, paiements `paiements.tsx`, dossier admin
     `dossier-admin.tsx`], documents, produit (dérivé du devis signé), garanties,
     emails Gmail, origine.
  Retirés de l'interface (colonnes conservées) : probabilité, objectif, montant
  manuel, mode de paiement. `/modifier` = « Tout modifier », sans l'étape pour un client.
- **Devis** (`/devis`, `/leads/[id]/devis/[devisId]`) — éditeur en 3 temps + fil
  d'étapes (Composer → Vérifier → Envoyer → Signé) : **1 · La pergola**
  (configurateur `sur-mesure-calc.tsx`, prix HT vendeur ; **couleur RAL** : teinte
  standard RAL 7016 ou option → ligne « Option couleur — RAL … », supplément HT libre,
  0 = offerte, `ConfigSM.couleur` ; validée → résumé repliable), **2 · Options & produits** (catalogue interne par catégorie),
  **3 · Lignes** (Désignation · Qté · PU HT · TVA · Total ; description / remise
  ligne en détail replié ; ligne libre), remise commerciale globale répartie par
  taux, clause suspensive auto, TVA du devis (10 % rénovation / 20 % neuf).
  Bandeau totaux collant (HT / TVA / **TTC**) + actions : Créer / Enregistrer,
  **Envoyer au client** (Gmail + PDF → « Devis envoyé »), **Faire signer** (Yousign,
  contact signataire créé automatiquement), menu Plus (PDF, Dupliquer, Pennylane).
  Colonne droite : client du devis **éditable** (nom, adresse, CP, ville → poussés
  dans Pennylane) + aperçu : récapitulatif vivant avant création, PDF Pennylane après.
  Config persistée (`devis.config`) ; statuts Brouillon → Envoyé → Signé / Non retenu.
- Téléphones : affichés via `formatTelephone` (« 06 58 24 33 61 »), liens via `telHref` (+33…).
- **Planning** (`/emploi-du-temps`) : files personnelles (RDV, relances, rappels,
  devis, sommeil, chantiers) + tâches + agenda Google.
- **Dashboard / Commercial / Comptabilité (admin)** : `dashboard/data.ts › getStats`,
  périodes = toutes années/mois présents (`?mois=YYYY`, `YYYY-MM`, défaut année en cours).
- **Commentaires**, **Réglages** (admin : descriptions sur-mesure, catalogue produits).
- **Nav** : à plat (Kanban · Liste · Clients · Devis · Planning · Dashboard · Plus),
  menu mobile ; recherche globale flottante en bas (⌘K) → pages avec `pb-24/28`.

## Modèle de données (Drizzle, `src/db/schema.ts`)
profiles (id=auth.users, email, nom, role admin|membre, objectif_mensuel) ·
stages (nom, **code**, position, couleur, cycle, is_gagnee, is_perdue) ·
leads (identité, source/campagne, stage_id, assigned_to, statut, montant HT,
**montant_ttc**, RDV, relance, métriques commerciales, acompte_encaisse,
paiement_espece, produit, pose (pose_assigned_to = membre, equipe_pose = externe),
adresse (client) / adresse_pose (si différente), **deleted_at**, raw_payload) ·
notes (conversation, mentions) · echanges (journal : appel, relance, email, etape,
devis_cree, devis_envoye, devis_accepte, attribution, suppression…) ·
devis (numero, montant HT, **montant_ttc**, **lignes** jsonb, **accepte_at**,
**config** jsonb, statut, external_id Pennylane) · factures (type acompte|solde,
montant_ht, **montant_ttc**, **lignes** par taux, statut draft|finalized|supprimee) ·
**paiements** (lead_id, date, montant, mode virement|cheque|cb|especes|financement|autre,
reference ; `leads.acompte_encaisse` / `paiement_espece` = SOMMES recalculées à
chaque écriture, `paiements-actions.ts`) · taches · documents · notifications ·
produits_catalogue · sur_mesure_mapping. **Client pro** : `leads.entreprise` (raison
sociale) + `siret` + `tva_intracom` → Pennylane `company_customer` (type mémorisé dans
`pennylane_customer_type`) ; sinon `individual_customer`.

## Intégrations
- **Meta → CRM** : `POST /api/leads/inbound` (Bearer `INBOUND_WEBHOOK_SECRET`,
  comparaison à temps constant), dédoublonnage email / téléphone (chiffres),
  entrée en `a_traiter`. Seule route API publique dans `PUBLIC_PATHS`.
- **Pennylane** (`src/lib/pennylane.ts`) : client, devis (lignes recréées à chaque
  enregistrement), factures (une ligne HT par taux, `special_mention`), PDF, statut.
- **Gmail / Agenda** (`email-actions.ts`, `google-calendar.ts`) : OAuth par ADV via
  `GOOGLE_SENDERS` ; le token agit sur SA boîte, `Reply-To` = ADV connecté.

## Bibliothèques internes
`lib/devis-calc.ts` (TVA), `lib/devis-accepte.ts`, `lib/facturation.ts`,
`lib/pipeline.ts` + `pipeline-server.ts`, `lib/format.ts` (euros, cents, dates Paris,
`moisLabelFr`), `lib/ouvrir-dans.ts` (ouvrir un lien asynchrone), `lib/use-auto-refresh.ts`,
`components/confirm-dialog.tsx` (jamais `confirm()` natif), `components/data-table.tsx`
(`FilterSelect`, `Td`).

## Commandes
`npm run dev` · `npm run build` · `npm run lint` · `npx tsc --noEmit` ·
`npm run db:generate` · `npm run db:migrate` · `npm run db:seed` (étapes + codes) ·
`npm run db:setup-rls` · `npm run db:seed-leads` (démo) · `npm run db:studio`.
Dev depuis une autre machine : `allowedDevOrigins` dans `next.config.ts`.

## Notes techniques
- Client DB : singleton `max: 1` (pooler session, port 5432 en local) ; prod Vercel :
  pooler transaction (6543).
- Composants client n'importent JAMAIS un module serveur (db) : séparer les
  définitions pures (ex. `clients/phases-meta.ts` vs `phases.ts`).
- Thème sombre non activé (tokens `.dark` = défauts shadcn, non brandés).
