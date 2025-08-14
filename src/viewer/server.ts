import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';

export type ViewerServer = {
  server: http.Server;
  url: string;
  port: number;
  close: () => Promise<void>;
};

export type ViewerOptions = {
  host?: string;      // default '127.0.0.1'
  port?: number;      // default 0 → ephemeral
  open?: boolean;     // default true
  logger?: { info: (...a:any[]) => void; error: (...a:any[]) => void };
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function resolveViewerRoot(): string {
  // Compiled JS lives in dist/viewer/*.js; serve static files from the same folder
  // Using __dirname keeps this compatible with CommonJS output
  return path.resolve(__dirname);
}

function resolveAsset(pth: string): string {
  return path.join(resolveViewerRoot(), pth);
}

async function serveFile(res: http.ServerResponse, relPath: string): Promise<void> {
  const filePath = resolveAsset(relPath);
  const ext = path.extname(filePath);
  const ctype = CONTENT_TYPES[ext] || 'application/octet-stream';
  const data = await fs.readFile(filePath);
  res.writeHead(200, { 'Content-Type': ctype, 'Cache-Control': 'no-store' });
  res.end(data);
}

function openBrowser(url: string): void {
  const { platform } = process;
  const bin = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process');
    spawn(bin, [url], { stdio: 'ignore', shell: true, detached: true }).unref();
  } catch {}
}

export async function startViewerServer(opts: ViewerOptions = {}): Promise<ViewerServer> {
  const host = opts.host ?? '127.0.0.1';
  const desiredPort = opts.port ?? 0;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      if (url.pathname === '/healthz') { res.writeHead(200); res.end('ok'); return; }
      const route = url.pathname === '/' ? '/index.html' : url.pathname;

      switch (route) {
        case '/index.html': await serveFile(res, 'index.html'); return;
        case '/app.js':     await serveFile(res, 'app.js');     return;
        case '/styles.css': await serveFile(res, 'styles.css'); return;
        case '/favicon.ico':await serveFile(res, 'favicon.ico');return;
        default: {
          // prevent path traversal
          if (!/^[a-zA-Z0-9_./-]+$/.test(route)) { res.writeHead(404); res.end(); return; }
          // allow module files like /state.js, /tree.js, etc.
          await serveFile(res, route.replace(/^\//,''));
        }
      }
    } catch (_e) {
      res.writeHead(404); res.end();
    }
  });

  await new Promise<void>((ok) => server.listen(desiredPort, host, () => ok()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : desiredPort;
  const url = `http://${host}:${port}/`;

  if (opts.open !== false) openBrowser(url);
  opts.logger?.info?.(`CodeReap viewer listening on ${url}`);

  const close = async () => await new Promise<void>((ok) => server.close(() => ok()));
  return { server, url, port, close };
}


