import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin, Connect } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Resolved = { file: string; params: Record<string, string> };

function resolve(apiDir: string, segments: string[]): Resolved | null {
  // Walk segment-by-segment, allowing one [param] substitution per level.
  let dir = apiDir;
  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    if (isLast) {
      const exact = join(dir, seg + '.ts');
      if (existsSync(exact)) return { file: exact, params };
      const entries = existsSync(dir) ? readdirSync(dir) : [];
      const dyn = entries.find(e => /^\[.+\]\.ts$/.test(e));
      if (dyn) {
        const name = dyn.slice(1, -4);
        params[name] = decodeURIComponent(seg);
        return { file: join(dir, dyn), params };
      }
      return null;
    }
    const exactDir = join(dir, seg);
    if (existsSync(exactDir)) { dir = exactDir; continue; }
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    const dyn = entries.find(e => /^\[.+\]$/.test(e));
    if (dyn) {
      const name = dyn.slice(1, -1);
      params[name] = decodeURIComponent(seg);
      dir = join(dir, dyn);
      continue;
    }
    return null;
  }
  return null;
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const ct = (req.headers['content-type'] || '').toString();
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function decorateRes(res: ServerResponse) {
  const r = res as any;
  r.status = (code: number) => { res.statusCode = code; return r; };
  r.json = (obj: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
    return r;
  };
  r.send = (data: any) => {
    if (data && typeof data === 'object' && !Buffer.isBuffer(data)) return r.json(data);
    res.end(data == null ? '' : String(data));
    return r;
  };
  return r;
}

export function devApiPlugin(apiDir: string): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const segments = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
        const match = resolve(apiDir, segments);
        if (!match) return next();

        try {
          const mod = await server.ssrLoadModule(match.file);
          const handler = (mod as any).default;
          if (typeof handler !== 'function') {
            res.statusCode = 500;
            res.end(`Handler at ${match.file} has no default export`);
            return;
          }

          const query: Record<string, string> = {};
          url.searchParams.forEach((v, k) => { query[k] = v; });
          Object.assign(query, match.params);

          const vReq = req as any;
          vReq.query = query;
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes((req.method || '').toUpperCase())) {
            vReq.body = await readBody(req);
          }
          const vRes = decorateRes(res);
          await handler(vReq, vRes);
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error(`[dev-api] ${req.url} crashed:`, e);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message || 'dev-api handler crashed' }));
          }
        }
      };
      server.middlewares.use(middleware);
    },
  };
}
