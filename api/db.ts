import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');

// Use a singleton pattern to avoid multiple pools in serverless environment
// and handle potential import issues with pg in ESM.

let pool: pg.Pool;

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing!");
}

if (!pool) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
}

export default pool;
