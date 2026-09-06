# CRM Pergolab

CRM web Kanban pour le suivi des prospects issus des publicités Meta
(Facebook / Instagram Lead Ads), destiné à une petite équipe (2 à 5 personnes).

Voir [`CLAUDE.md`](./CLAUDE.md) pour la mission complète, le modèle de données
et l'ordre de construction.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** (PostgreSQL + Auth)
- **Drizzle ORM** (schéma + migrations)
- **dnd-kit** (glisser-déposer du Kanban)
- **Recharts** (graphiques du dashboard)
- Déploiement **Vercel**

## Prérequis

- Node.js 20+
- Un projet Supabase (créé par le propriétaire)

## Configuration

1. Copier `.env.example` en `.env.local` :

   ```bash
   cp .env.example .env.local
   ```

2. Renseigner les variables (voir le tableau ci-dessous).

### Variables d'environnement

| Variable | Où la trouver | Usage |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > Data API | Client navigateur + serveur |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API Keys (anon) | Client navigateur + serveur |
| `DATABASE_URL` | Supabase > Project Settings > Database > Connection string | Migrations / seed Drizzle |
| `INBOUND_WEBHOOK_SECRET` | À générer (`openssl rand -hex 32`) | Protection du webhook entrant |

> Ne jamais committer `.env.local` ni de vraie clé. Les valeurs de production
> vont dans Supabase et Vercel.

## Commandes

```bash
npm run dev          # serveur de développement (http://localhost:3000)
npm run build        # build de production
npm run lint         # lint
npm run db:generate  # génère les migrations Drizzle depuis le schéma
npm run db:migrate   # applique les migrations à la base
npm run db:push      # pousse le schéma directement (dev rapide)
npm run db:seed      # crée les 8 étapes par défaut du pipeline
npm run db:studio    # ouvre Drizzle Studio
```

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis renseigner les variables
npm run dev
```

L'application est disponible sur http://localhost:3000.
