# CRM Pergolab — Mémoire du projet

## Mission
CRM web pour une petite équipe (2 à 5 personnes) qui suit des prospects venant
de publicités Meta (Facebook / Instagram Lead Ads), sur un pipeline Kanban.
Le CRM offre une connexion sécurisée, une fiche prospect détaillée avec espace
de notes, et un tableau de bord. Déploiement sur Vercel.

## Stack imposée (ne pas changer sans demander)
- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (PostgreSQL + Auth) — le projet Supabase est créé par le propriétaire
- Drizzle ORM pour le schéma et les migrations
- dnd-kit pour le glisser-déposer du Kanban
- Recharts pour les graphiques du dashboard
- Déploiement sur Vercel

## Design / UI — aligné sur la marque Pergolab (MAJ : remplace l'ancienne charte bleue)
- Minimaliste, SaaS moderne, épuré. Thème CLAIR par défaut. Fond blanc cassé légèrement
  vert, surfaces de cartes blanches, bordures fines, beaucoup d'espace, aplats nets.
- **Palette (tokens dans `globals.css`)** :
  - Accent principal = **vert forêt de la marque** (`--primary`, ~oklch(0.34 0.05 158)) :
    boutons primaires, nav active, focus, avatars, compteurs.
  - **Lime** de la marque (`--brand` / `--color-brand`, ~oklch(0.82 0.17 125)) = touche
    d'accent : badge logo « CRM », soulignement de l'onglet actif, surbrillances.
  - Sémantique des statuts conservée : **vert = gagné, rouge = perdu, orange = relance**,
    bleu = info RDV. (Le bleu n'est plus l'accent global, seulement le RDV.)
- **Typographie** : titres en **Barlow gras MAJUSCULES** via les utilitaires `.text-display`
  (gros titres : nom du prospect, titres de page) et `.text-eyebrow` (petits surtitres en
  majuscules espacées : titres de section, en-têtes de colonne). Barlow chargé via
  `next/font/google` (`--font-barlow` → `--font-heading`). Corps de texte = Geist.
- **Étiquettes/badges VOYANTS** : pastilles pleines, texte blanc, MAJUSCULES bold, façon
  tags du site (« EN STOCK », « BEST SELLER »). RDV = bleu plein, relance = orange plein,
  Gagnée = vert plein, Perdue = rouge plein, En cours = gris.
- Étapes du Kanban repérées par une petite PASTILLE de couleur (pas de bandeaux pleins).
- Cartes : nom en évidence, **assignation (avatar + responsable)**, montant (€) + proba (%),
  bandeau **Code Postal + dernière mise à jour**, badges RDV / relance.
- En-tête de colonne : nom de l'étape (eyebrow) + nombre de fiches + somme des montants.
- Navigation : logo PERGOLAB + onglets MAJUSCULES Kanban / Liste / Dashboard, avatar.
- Recherche globale : barre flottante fixée en bas (`components/global-search.tsx`,
  raccourci ⌘K/Ctrl+K) qui cherche prospect/client par nom, email, téléphone, code
  postal ou entreprise (action serveur `searchLeads` dans `(app)/search-actions.ts`).
  Statut affiché : en_cours=Prospect, gagnee=Client, perdue=Perdu.
- Composants shadcn/ui, cohérence sur tout le CRM.

## Workflow du prospect
Entre via Meta dans « À traiter », puis : Contact → Rendez-vous → Devis →
Issue (Signée ou KO). À tout moment : mise en relance (date prochaine relance + compteur).

Étapes du pipeline par défaut (table `stages`, MODIFIABLES), réparties en 2 CYCLES
de vente (champ `cycle`) — bascule à l'envoi du devis :
CYCLE 1 — Prospection :
1. À traiter
2. Pas de réponse
3. Rappeler
4. Devis à envoyer
CYCLE 2 — Devis & closing :
- Rendez-vous (déplacé en cycle 2 : un RDV fait partie du closing)
6. Devis envoyé
7. Signée  → marque la fiche « Gagnée » (is_gagnee)
8. KO      → marque la fiche « Perdue » (is_perdue)

Kanban + Liste ont un sélecteur « Prospection | Devis | Pose & technique » (toggle)
qui filtre les colonnes / lignes selon le cycle de l'étape.
Mode FOCUS (Kanban) : sélecteur 🎯 à droite (`FocusSelect`) → on choisit une étape,
le board n'affiche plus que ses cartes en grille pleine largeur (pour traiter un
gros volume d'une zone, ex. « À traiter » / « Rappeler »). « Vue normale » pour sortir.
Changer de CYCLE (le drag ne marche qu'au sein du cycle affiché) :
- Kanban : glisser une carte sur l'ONGLET d'un cycle → la place dans la 1ère étape de
  ce cycle (onglets = zones droppables `cycle-<n>`, la vue suit la carte).
- Fiche : bouton « Devis envoyé → » (cycle 1→2) et « Démarrer la pose → » (si gagnée,
  →cycle 3) via l'action serveur `passerAuCycle(leadId, cycle)`.

Important :
- Variantes de RDV (physique / visio / à reprogrammer) = champs `rdv_type` / `rdv_statut`,
  PAS des colonnes.
- Relances = champs `next_relance_date` / `relance_count`, PAS des colonnes.
  Une carte peut afficher « relancé 2× · prochaine 15/09 ».

## Modèle de données (Drizzle)
profiles
  id (uuid, PK, lié à Supabase Auth), email, nom, role

stages
  id (uuid, PK), nom, position (int), couleur, cycle (int: 1=prospection,
  2=devis & closing), is_gagnee (bool), is_perdue (bool)

leads
  id (uuid, PK), created_at (timestamptz),
  stage_id (uuid, FK -> stages), assigned_to (uuid, FK -> profiles),
  nom, entreprise, email, telephone, source, campagne,
  montant (numeric), probabilite (int), objectif_date (date),
  type_projet, code_postal,
  date_installation (TEXT, créneau libre ex. « le plus rapidement possible »),
  date_souhaitee_appel (TEXT, créneau libre ex. « après-midi (14h-18h) »),
  statut (en_cours / gagnee / perdue),
  rdv_date (date), rdv_type (physique / visio), rdv_statut (prevu / a_reprogrammer / honore),
  next_relance_date (date), relance_count (int),
  -- Métriques commerciales --
  date_premier_contact (timestamptz, pour le délai de rappel / speed-to-lead),
  raison_perte (enum: prix/delai/concurrent/injoignable/annule/non_qualifie/autre),
  mode_paiement (enum: comptant/financement_60/financement_120),
  acompte (numeric), montant_achat (numeric, coût fournisseur → marge),
  date_signature (date, fixée au passage en gagnée via COALESCE → CA/marge par mois),
  -- Produit / configurateur --
  gamme, dimensions, finition, options, type_pose (enum: autoportee/adossee),
  -- Cycle 3 : pose & technique --
  pose_assigned_to (uuid FK -> profiles, poseur/métreur), date_metre (date),
  fournisseur, ref_commande, date_commande (date),
  date_livraison_prevue/reelle (date), date_pose_prevue/reelle (date), adresse_pose,
  updated_at (timestamptz), updated_by (uuid FK -> profiles), raw_payload (jsonb)

Statut « gagnée » COLLANT : une fiche signée reste gagnee à travers tout le cycle 3
(la dérivation statut traite cycle===3 comme gagnee ; perdue uniquement via KO).
Marge = montant - montant_achat.

notes  (= fil de CONVERSATION d'équipe sur la fiche, avec @mentions)
  id (uuid, PK), lead_id (FK -> leads), user_id (FK -> profiles),
  contenu (text), mentions (uuid[] : profils @mentionnés), created_at (timestamptz)
  → composant leads/[id]/conversation.tsx : autocomplétion @ (1er mot du nom),
    mise en évidence des mentions, action serveur addMessage(leadId, contenu, mentions[]).
    Notifications des mentionnés = à venir (email Gmail quand configuré).

echanges  (= journal d'activité, alimenté par les PILULES d'actions rapides de la fiche)
  id (uuid, PK), lead_id (FK -> leads), user_id (FK -> profiles),
  type (TEXT : appel / relance / email / rdv_honore / devis_envoye / autre),
  contenu (text : libellé libre si type=autre), date (timestamptz)
  → un clic sur une pilule journalise l'activité ET met à jour le champ lié :
    appel ⇒ date_premier_contact (si vide) · relance ⇒ relance_count +1 (+ prochaine
    date) · rdv_honore ⇒ rdv_statut=honore. Composant : leads/[id]/activite-pills.tsx,
    action serveur logActivite() dans leads/[id]/actions.ts.

devis
  id (uuid, PK), lead_id (FK -> leads), numero, montant (numeric),
  statut, lien_externe, created_at (timestamptz)

taches  (= todolist personnelle, chacun ne voit QUE les siennes)
  id (uuid, PK), user_id (FK -> profiles, propriétaire), titre (text),
  echeance (date, optionnelle), fait (bool), fait_at (timestamptz),
  lead_id (FK -> leads, optionnel, set null), created_at (timestamptz)

Relations : un profile a plusieurs leads (responsable) ; un stage a plusieurs
leads ; un lead a plusieurs notes, échanges et devis ; notes et échanges
rattachés à leur auteur (user_id) ; une tâche appartient à un profil et peut
pointer un lead.

## Gestion d'emploi du temps (menu « Planning », /emploi-du-temps)
Espace de travail QUOTIDIEN par ADV, alimenté par SES leads (assigned_to = moi).
Chaque lead est rangé dans UNE seule file (la plus urgente), calculée à la volée :
RDV du jour / à reprogrammer · Relances du jour (next_relance_date ≤ auj.) ·
Rappels (étapes « Rappeler »/« Pas de réponse ») · Devis à envoyer ·
Devis sans réponse (« Devis envoyé » figé +3 j) · Leads en sommeil (en cours,
updated_at +48 h, hors RDV/relance à venir). Chaque ligne → fiche du lead.
+ Tâches manuelles (table `taches`) avec échéance et lien lead optionnel.
Actions serveur : addTache / toggleTache / deleteTache (toutes filtrées sur
l'utilisateur connecté). Page server-rendue (files) + `todo-list.tsx` (client).

## Kanban
- Une colonne par étape, drag-drop pour changer d'étape.
- Carte = nom, montant (€), probabilité (%), Type de projet, Code Postal,
  Date d'installation, Date souhaitée pour l'appel. En évidence : date RDV +
  relance (compteur + prochaine date).
- En-tête de colonne : nombre de fiches + somme des montants (€).

## Fiche prospect
La fiche ÉVOLUE selon le cycle de l'étape (`lead.stage.cycle`) :
- Toujours : bandeau, Activité (pilules), Informations, Notes.
- RDV + Relance : cycles 1 & 2 · Suivi commercial + Produit : cycles 2 & 3 ·
  Pose & technique : cycle 3 uniquement.
- Les PILULES d'activité changent aussi par cycle (cycle 3 : Métré réalisé /
  Commande passée / Livré / Posé, qui stampent date_metre / date_commande /
  date_livraison_reelle / date_pose_reelle).

- Bandeau infos principales : nom, montant (€), probabilité (%), objectif (date),
  étape actuelle, boutons Gagnée / Perdue.
- Bloc RDV : date, type (physique/visio), statut (prévu / à reprogrammer / honoré).
- Bloc Relance : prochaine date + nombre de relances.
- Champs métier : Type de projet, Code Postal, Date d'installation,
  Date souhaitée pour l'appel, source, campagne, responsable.
- Section Notes : notes horodatées avec auteur (historique gardé).
- Section Échanges : journal des contacts (appel / email / RDV), saisi à la main.
- Section Devis : historique (numéro, montant, statut, lien externe).
- Bouton Modifier.

## Tableau de bord
- Nombre de prospects + valeur du pipeline (€) par étape.
- Leads entrants par jour / semaine / mois.
- Répartition par source et par campagne Meta.
- Taux de conversion (Signée vs KO).
- RDV à venir + prospects à relancer (next_relance_date proche).
- Montant signé (€) sur la période sélectionnée.

## Entrée automatique des leads Meta
- Endpoint POST `/api/leads/inbound` appelé par Zapier / Make.
- Protégé par `Authorization: Bearer <SECRET>` lu depuis `INBOUND_WEBHOOK_SECRET`.
- Valide le secret, normalise les champs (dont métier), insère dans « À traiter ».

## Envoi d'emails via Gmail (OAuth) — niveau 1 : manuel depuis la fiche
- Bloc « Envoyer un email » dans la carte Activité de la fiche : modèles (Relance /
  Envoi de devis / Prise de contact) avec le prénom, destinataire pré-rempli.
- Action serveur `sendLeadEmail()` (leads/[id]/email-actions.ts) : `OAuth2Client`
  (`google-auth-library`) avec refresh token → access token → POST gmail send.
  From = `GOOGLE_SENDER` (compte d'envoi autorisé, ex. adv@pergolab.fr) ; Reply-To =
  email de l'ADV connecté (réponses dans SA boîte). Journalise un `echange` type=email.
  → NB : on a basculé du compte de service + délégation domaine vers OAuth car l'org
    Google bloquait la création de clés de compte de service (iam.disableServiceAccountKeyCreation)
    et l'admin n'avait pas les droits org.
- Variables d'env : `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + soit `GOOGLE_REFRESH_TOKEN`
  + `GOOGLE_SENDER` (expéditeur unique), soit `GOOGLE_SENDERS` (JSON multi-expéditeurs :
  `[{login,from,refreshToken}]`, routage selon l'email de connexion ; `resolveSender`
  dans `lib/email-sender.ts`). Absentes → bloc « à configurer ». Setup : écran de
  consentement OAuth (Interne) + ID client OAuth (Web) + refresh token via OAuth
  Playground. Droits « Propriétaire de projet » suffisent (pas besoin de droits org).
- LECTURE du fil Gmail : `fetchLeadEmails(leadEmail)` (scope `gmail.readonly`) cherche
  `from:/to:` le lead dans la boîte de l'ADV connecté → section « Emails » sur la fiche
  (`email-thread.tsx`) qui affiche envois + réponses (objet, date, corps, Reçu/Envoyé).
  La fiche affiche aussi « Connecté : X → envoi depuis Y » (diagnostic expéditeur).
- Évolutions : refresh token PAR ADV (envoi perso depuis chaque boîte), niveau 2
  (relances auto via cron), niveau 3 (réception des réponses).
- ⚠️ L'API Gmail/Agenda agit sur la boîte PROPRIÉTAIRE du refresh token, pas sur
  l'en-tête `From`. Si le token d'une entrée GOOGLE_SENDERS appartient à adv@,
  l'envoi part d'adv@ même si `from`=sofiane (seul Reply-To est respecté).
  `resolveSender` renvoie null si l'email connecté ne matche aucun `login`
  (plus d'usurpation silencieuse). Chaque token doit être généré CONNECTÉ avec
  l'adresse correspondante.

## Google Agenda (Calendar API, OAuth — scope `calendar.events`)
- `lib/google-calendar.ts` : `upsertCalendarEvent` / `deleteCalendarEvent` /
  `listUpcomingEvents` (OAuth2Client + refresh token par ADV via `resolveSender`).
- RDV → Agenda : à l'enregistrement de la fiche (`modifier/actions.ts`), si
  `rdv_date` est présent, crée/maj un évènement dans l'agenda de l'ADV connecté
  (id stocké dans `leads.rdv_event_id`) ; champ `rdv_heure` (« HH:MM ») → évènement
  horaire (1 h) sinon journée entière ; **invite le client** (attendee = email du
  lead, `sendUpdates=all`). RDV effacé → évènement supprimé. Échec silencieux
  (try/catch) si scope absent.
- Agenda → CRM : action `fetchAgenda()` + `agenda-google.tsx` affichent les
  prochains évènements de l'ADV dans le Planning (/emploi-du-temps).
- Prérequis : régénérer les refresh tokens OAuth en ajoutant le scope
  `calendar.events` (sinon l'intégration échoue en silence / affiche « scope »).

## Sécurité
- Supabase Auth (email + mot de passe), 2FA TOTP activable.
- Sessions sécurisées (cookies httpOnly), routes privées protégées.
- Row Level Security (RLS) sur toutes les tables.
- Webhook entrant protégé par secret.

## Règles de travail
1. Travailler par étapes, dans l'ordre ci-dessous.
2. Fin de CHAQUE étape : résumer, lancer build + lint, puis ARRÊTER et attendre validation.
3. Ne créer AUCUN compte à la place du propriétaire (Supabase, Vercel, Zapier, Meta).
   Demander les clés/accès et indiquer précisément quoi faire et où.
4. Ne JAMAIS committer de secret. `.env.example` documenté, `.gitignore` correct.
5. Avant toute action destructive : demander confirmation explicite.

## Ordre de construction (validation entre chaque étape)
- ÉTAPE 0 : Scaffold projet, libs, schéma Drizzle complet + migrations + seed, page d'accueil. ✅ FAIT
- ÉTAPE 1 : Connexion Supabase + application du schéma + seed des étapes. ✅ FAIT (eu-west-1, pooler 5432)
- ÉTAPE 2 : Auth (login, protection des routes via proxy.ts) + invitation manuelle des membres
  (trigger auth.users -> profiles installé). ✅ FAIT
- ÉTAPE 3 : Activation de la RLS (anon = 0 accès, authenticated = accès complet,
  service_role contourne). ✅ FAIT — `npm run db:setup-rls`
- ÉTAPE 4 : Kanban (affichage + drag-drop dnd-kit, en-têtes count+somme, cartes). ✅ FAIT
  Nav Kanban/Liste/Dashboard dans (app)/layout. Données lues via Drizzle (db).
  Seed leads démo : `npm run db:seed-leads`.
- ÉTAPE 5 : Fiche prospect (infos + RDV + relance + champs métier + Notes) + formulaire de
  modification (`/leads/[id]` et `/leads/[id]/modifier`). Cartes Kanban cliquables. ✅ FAIT
- ÉTAPE 6 : Sections Échanges et Devis.
- ÉTAPE 7 : Endpoint webhook `POST /api/leads/inbound`. ✅ FAIT
  Protégé par `Authorization: Bearer <INBOUND_WEBHOOK_SECRET>` (PAS besoin de
  service_role : Drizzle contourne la RLS). Normalise un JSON souple (gère clés
  canoniques + variantes Meta : full_name/first+last, phone_number, platform→source
  FB/IG, campaign_name, + `field_data[]` Meta aplati), insère dans « À traiter »
  (non assigné, statut en_cours), conserve `raw_payload`. `/api` ajouté aux
  PUBLIC_PATHS du proxy (les routes API gèrent leur propre auth). Connexion prévue
  via Make (Meta ou Google Sheet → POST). Testé OK en local (curl).
- ÉTAPE 8 : Tableau de bord (`/dashboard`, page d'accueil post-login). ✅ FAIT
  Vue COHORTE : les leads sont classés par DATE DE RÉCEPTION (`created_at`).
  Sélecteur de MOIS (`?mois=YYYY-MM`, défaut « Année ») = on voit les leads reçus
  sur la période et ce qu'ils ont donné. KPI cohorte : Leads reçus, CA généré, marge
  + %, taux de closing, pipeline, devis en attente, acomptes, panier moyen, RDV à
  venir, à relancer. Graphes : Leads reçus/mois (Recharts `BarParMois`), entonnoir,
  leads par source, perf par ADV. Sélecteur de PÉRIMÈTRE (`?adv=<id>`, « (moi) »)
  qui se combine au mois. Démo : `db:seed-leads` (2 ADV, marges, acomptes, signés
  répartis 2026). Onglet Dashboard en 1er.
  Liste : barre de filtres composables (ET) — cycle (toggle + compteurs), Étape
  (limitée au cycle choisi), Responsable (« (moi) »), Mois de réception, Département
  (2 premiers chiffres du code postal, ex. « Dépt 31 (5) ») + « Réinitialiser » et
  compteur de résultats. (Recherche par CP exact = barre de recherche globale.)
  NB : `date_signature` existe toujours mais le dashboard attribue par réception.
- ÉTAPE 9 : Vue liste + filtres + gestion des étapes.

## Notes techniques
- Client DB (`src/db/index.ts`) : singleton + `max: 1` pour ne pas épuiser le
  pooler Supabase en mode session (15 clients max) lors du hot-reload en dev.
- DATABASE_URL en local = pooler **session** (port 5432) pour migrations + app.
  En prod sur Vercel, prévoir le pooler **transaction** (port 6543) pour la
  concurrence serverless.

## Commandes
- `npm run dev` — serveur de dev
- `npm run build` — build de production
- `npm run lint` — lint
- `npm run db:generate` — génère les migrations Drizzle
- `npm run db:migrate` — applique les migrations
- `npm run db:seed` — seed des 8 étapes par défaut
- `npm run db:studio` — Drizzle Studio
