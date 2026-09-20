import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handleApiRequest } from './routes.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const urlPath = req.url || '/';

  // API Route Routing
  if (urlPath.startsWith('/api') || urlPath.startsWith('/applications')) {
    let bodyText = '';
    req.on('data', (chunk) => {
      bodyText += chunk;
    });

    req.on('end', async () => {
      const response = await handleApiRequest(method, urlPath, bodyText);

      res.writeHead(response.statusCode, response.headers || {});
      res.end(response.body);
    });
    return;
  }

  // Static File Serving for Public Web UI
  let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log(`CareerPilot Local Dev Server running at http://localhost:${PORT}`);
  console.log('Frontend UI : http://localhost:3001');
  console.log('API Endpoint: http://localhost:3001/api/applications');
  console.log('========================================');
});
