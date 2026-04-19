import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { devApiPlugin } from './dev-api-plugin';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;
    if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), devApiPlugin(path.resolve(__dirname, 'api'))],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
