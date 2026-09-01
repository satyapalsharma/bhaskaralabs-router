import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara";
const client = postgres(url);
export const db = drizzle(client);
export * as schema from "./schema";