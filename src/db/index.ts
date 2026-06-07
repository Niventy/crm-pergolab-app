import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL n'est pas défini dans l'environnement.");
}

// Singleton : en dev, le hot-reload réévalue ce module et recréerait un pool
// à chaque fois, ce qui épuise vite le pooler Supabase (mode session = 15
// clients max). On réutilise donc la même connexion entre les rechargements.
const globalForDb = globalThis as unknown as {
  _pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb._pgClient ??
  postgres(connectionString, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });

export { schema };
