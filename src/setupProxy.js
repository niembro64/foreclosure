// Dev-only bridge to the shared backend.
//
// The CivilView bridge is no longer part of this repo — it lives in
// web_games_backend, which is the single backend behind games.niemo.io
// (https://github.com/niembro64/web_games_backend). In production nginx
// routes /api/ there; in development this forwards the same paths to a local
// checkout of it, so `npm start` behaves like the deployed site.
//
// Start the backend alongside the dev server:
//
//   cd ../web_games_backend && npm start
//
// Without it the New Jersey screens will report that the bridge is
// unreachable, which is the same failure the deployed site would show if the
// backend were down.

const BACKEND_ORIGIN = process.env.WEB_GAMES_BACKEND_ORIGIN || 'http://127.0.0.1:3001';

module.exports = function setupProxy(app) {
  app.use('/api', async (request, response) => {
    const targetUrl = `${BACKEND_ORIGIN}${request.originalUrl}`;
    try {
      const upstream = await fetch(targetUrl, {
        method: request.method,
        headers: { Accept: request.headers.accept || '*/*' },
      });
      const body = await upstream.text();
      const contentType = upstream.headers.get('content-type');
      if (contentType) response.set('Content-Type', contentType);
      const proxyMarker = upstream.headers.get('x-civilview-proxy');
      if (proxyMarker) response.set('X-CivilView-Proxy', proxyMarker);
      response.set('Cache-Control', 'no-store');
      response.status(upstream.status).send(body);
    } catch (error) {
      response
        .status(502)
        .type('text')
        .send(
          `Could not reach web_games_backend at ${BACKEND_ORIGIN}. ` +
            'Start it with `npm start` in a checkout of ' +
            'https://github.com/niembro64/web_games_backend.',
        );
    }
  });
};
