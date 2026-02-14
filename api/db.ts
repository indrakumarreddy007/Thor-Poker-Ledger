import { createRequire } from 'module';
import type { Pool as PoolType } from 'pg';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

// Use a singleton pattern to avoid multiple pools in serverless environment
// and handle potential import issues with pg in ESM.

// Declare strict type for global to avoid implicit any
declare global {
    var _postgresPool: PoolType | undefined;
}

let pool: PoolType;

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing!");
}

if (!globalThis._postgresPool) {
    globalThis._postgresPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
}

pool = globalThis._postgresPool!;

export default pool;
