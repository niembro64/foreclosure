const fs = require('fs');
const http = require('http');
const path = require('path');
const { requestCivilViewHtml, validateCivilViewParams } = require('./civilViewBridge');

const buildDirectory = path.resolve(__dirname, '..', 'build');
const configuredPort = Number(process.env.FORECLOSURE_PORT || 3001);
const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 3001;
const hostname = process.env.FORECLOSURE_HOST || '127.0.0.1';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const send = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
  response.end(body);
};

const handleApiRequest = async (request, response, url) => {
  if (request.method !== 'GET') {
    send(response, 405, 'Method not allowed.', { Allow: 'GET' });
    return;
  }

  if (url.pathname === '/api/health') {
    send(response, 200, JSON.stringify({ civilViewBridge: 'ready' }), {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-CivilView-Proxy': '1',
    });
    return;
  }

  const countyId = url.searchParams.get('countyId') || '';
  const propertyId = url.searchParams.get('propertyId') || '';
  const validationError = validateCivilViewParams(countyId, propertyId);
  if (validationError) {
    send(response, 400, validationError, { 'Cache-Control': 'no-store' });
    return;
  }

  try {
    const html = await requestCivilViewHtml(countyId, propertyId);
    send(response, 200, html, {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'X-CivilView-Proxy': '1',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CivilView request failed.';
    send(response, 502, message, { 'Cache-Control': 'no-store' });
  }
};

const serveFile = async (request, response, filePath) => {
  try {
    const file = await fs.promises.stat(filePath);
    if (!file.isFile()) throw new Error('Not a file.');

    const extension = path.extname(filePath).toLowerCase();
    const immutable = filePath.includes(`${path.sep}static${path.sep}`);
    response.writeHead(200, {
      'Content-Length': file.size,
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  } catch (error) {
    send(response, 404, 'Not found.');
  }
};

const handleStaticRequest = async (request, response, url) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    send(response, 405, 'Method not allowed.', { Allow: 'GET, HEAD' });
    return;
  }

  if (url.pathname === '/') {
    response.writeHead(302, { Location: '/foreclosure/' });
    response.end();
    return;
  }
  if (url.pathname === '/foreclosure') {
    response.writeHead(301, { Location: '/foreclosure/' });
    response.end();
    return;
  }
  if (!url.pathname.startsWith('/foreclosure/')) {
    send(response, 404, 'Not found.');
    return;
  }

  const relativePath = decodeURIComponent(url.pathname.slice('/foreclosure/'.length));
  const requestedPath = path.resolve(buildDirectory, relativePath || 'index.html');
  if (requestedPath !== buildDirectory && !requestedPath.startsWith(`${buildDirectory}${path.sep}`)) {
    send(response, 400, 'Invalid path.');
    return;
  }

  try {
    const file = await fs.promises.stat(requestedPath);
    if (file.isFile()) {
      await serveFile(request, response, requestedPath);
      return;
    }
  } catch (error) {
    // Client-side routes without extensions fall through to the SPA entrypoint.
  }

  if (!path.extname(relativePath)) {
    await serveFile(request, response, path.join(buildDirectory, 'index.html'));
    return;
  }
  send(response, 404, 'Not found.');
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/civilview' || url.pathname === '/api/health') {
      await handleApiRequest(request, response, url);
      return;
    }
    await handleStaticRequest(request, response, url);
  } catch (error) {
    send(response, 500, 'Internal server error.');
  }
});

server.listen(port, hostname, () => {
  console.log(`Foreclosure production server listening at http://${hostname}:${port}/foreclosure/`);
});

const shutDown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
