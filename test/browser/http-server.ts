/**
 * Minimal in-process static HTTP server for browser E2E tests.
 * Zero npm dependencies, uses node:http and node:fs.
 */

// @ts-ignore
import rawHttp from 'node:http';
import rawFs from 'node:fs';
import rawPath from 'node:path';

const http = rawHttp as any;
const fs = rawFs as any;
const path = rawPath as any;

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

export interface LocalTestServer {
  readonly server: any;
  readonly port: number;
  readonly origin: string;
  close(): Promise<void>;
}

export function startTestServer(rootDir: string = process.cwd()): Promise<LocalTestServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req: any, res: any) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let pathname = decodeURIComponent(reqUrl.pathname);

        // Subpath support: rewrite /Cunata/ to root
        if (pathname.startsWith('/Cunata/')) {
          pathname = pathname.slice('/Cunata'.length);
        }

        if (pathname === '/' || pathname === '') {
          pathname = '/index.html';
        }

        // Prevent path traversal
        const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        let filePath = path.join(rootDir, safePath);

        if (!fs.existsSync(filePath)) {
          // Check if it's dist/ request or fallback
          if (fs.existsSync(path.join(rootDir, 'dist', safePath))) {
            filePath = path.join(rootDir, 'dist', safePath);
          } else if (fs.existsSync(path.join(rootDir, 'public', safePath))) {
            filePath = path.join(rootDir, 'public', safePath);
          } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(`404 Not Found: ${safePath}`);
            return;
          }
        }

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          const indexFile = path.join(filePath, 'index.html');
          if (fs.existsSync(indexFile)) {
            filePath = indexFile;
          } else {
            res.statusCode = 403;
            res.end('Directory listing forbidden');
            return;
          }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_MAP[ext] || 'application/octet-stream';

        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      } catch (err: any) {
        res.statusCode = 500;
        res.end(`Internal Error: ${err?.message || err}`);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr.port;
      const origin = `http://127.0.0.1:${port}`;

      resolve({
        server,
        port,
        origin,
        close() {
          return new Promise<void>((res) => {
            server.close(() => res());
          });
        },
      });
    });

    server.on('error', reject);
  });
}
