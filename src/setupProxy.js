const { requestCivilViewHtml, validateCivilViewParams } = require('../server/civilViewBridge');

module.exports = function setupProxy(app) {
  app.get('/api/health', (_request, response) => {
    response.status(200).json({ civilViewBridge: 'ready' });
  });

  app.get('/api/civilview', async (request, response) => {
    const countyId = String(request.query.countyId || '');
    const propertyId = String(request.query.propertyId || '');
    const validationError = validateCivilViewParams(countyId, propertyId);

    if (validationError) {
      response.status(400).type('text').send(validationError);
      return;
    }

    try {
      const html = await requestCivilViewHtml(countyId, propertyId);
      response.set({
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'X-CivilView-Proxy': '1',
      });
      response.status(200).send(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CivilView request failed.';
      response.status(502).set('Cache-Control', 'no-store').type('text').send(message);
    }
  });
};
