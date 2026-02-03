import { drizzle } from "drizzle-orm/libsql";
// Node client para Vercel serverless; /web é para browser/edge
import { createClient } from "@libsql/client";
import * as schema from "./schema.js";

if (!process.env.TURSO_DATABASE_URL) {
    throw new Error("TURSO_DATABASE_URL is not set");
}

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
