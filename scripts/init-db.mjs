#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import pg from 'pg';

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
dotenvConfig({ path: resolve(root, '.env.local') });
dotenvConfig({ path: resolve(root, '.env') });
const schemaPath = resolve(root, 'database.sql');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing. Put it in .env.local and retry.');
  process.exit(1);
}

const sql = readFileSync(schemaPath, 'utf8');
const needsSsl = /\b(neon\.tech|supabase|rds\.amazonaws)\b/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

try {
  const { rows } = await pool.query(
    "SELECT to_regclass('public.users')::text AS users, to_regclass('public.sessions')::text AS sessions"
  );
  if (rows[0].users && rows[0].sessions) {
    console.log('Schema already present — skipping. Drop tables manually if you want a clean reset.');
    process.exit(0);
  }
  await pool.query(sql);
  console.log('Schema applied from database.sql.');
} catch (e) {
  console.error('DB init failed:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
