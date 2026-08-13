const CIVIL_VIEW_ORIGIN = 'https://salesweb.civilview.com';
const ALLOWED_COUNTIES = new Set(['2', '10', '15', '17']);
const countySessions = new Map();

const getCookieValue = (setCookieHeaders, name) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return setCookieHeaders.join(',').match(new RegExp(`${escapedName}=([^;,\\s]+)`))?.[1] || '';
};

const getSetCookieHeaders = (headers) => {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const combinedHeader = headers.get('set-cookie');
  return combinedHeader ? [combinedHeader] : [];
};

const readSession = (headers) => {
  const setCookieHeaders = getSetCookieHeaders(headers);
  return {
    alb: getCookieValue(setCookieHeaders, 'AWSALB'),
    albCors: getCookieValue(setCookieHeaders, 'AWSALBCORS'),
    aspNet: getCookieValue(setCookieHeaders, 'ASP.NET_SessionId'),
  };
};

const cookieHeader = (session) =>
  [
    session.alb && `AWSALB=${session.alb}`,
    session.albCors && `AWSALBCORS=${session.albCors}`,
    session.aspNet && `ASP.NET_SessionId=${session.aspNet}`,
  ]
    .filter(Boolean)
    .join('; ');

const fetchHtml = async (url, headers = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`CivilView returned HTTP ${response.status}.`);
    return { html: await response.text(), headers: response.headers };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchListing = async (countyId) => {
  const url = new URL('/Sales/SalesSearch', CIVIL_VIEW_ORIGIN);
  url.searchParams.set('countyId', countyId);
  const response = await fetchHtml(url, {
    'User-Agent': 'games.niemo.io foreclosure CivilView bridge',
  });
  const session = readSession(response.headers);
  if (!session.aspNet) {
    throw new Error('CivilView did not create an ASP.NET session.');
  }
  countySessions.set(countyId, session);
  return response.html;
};

const fetchDetail = async (countyId, propertyId) => {
  let session = countySessions.get(countyId);
  if (!session?.aspNet) {
    await fetchListing(countyId);
    session = countySessions.get(countyId);
  }

  const requestDetail = async () => {
    const url = new URL('/Sales/SaleDetails', CIVIL_VIEW_ORIGIN);
    url.searchParams.set('PropertyId', propertyId);
    return fetchHtml(url, {
      Cookie: cookieHeader(session),
      Referer: `${CIVIL_VIEW_ORIGIN}/Sales/SalesSearch?countyId=${countyId}`,
      'User-Agent': 'games.niemo.io foreclosure CivilView bridge',
    });
  };

  let response = await requestDetail();
  if (!response.html.toLowerCase().includes('sales listing detail')) {
    await fetchListing(countyId);
    session = countySessions.get(countyId);
    response = await requestDetail();
  }
  if (!response.html.toLowerCase().includes('sales listing detail')) {
    throw new Error('CivilView did not return the requested detail page.');
  }
  return response.html;
};

const validateCivilViewParams = (countyId, propertyId) => {
  if (!ALLOWED_COUNTIES.has(countyId)) return 'Unsupported county.';
  if (propertyId && !/^\d{1,20}$/.test(propertyId)) return 'Invalid property ID.';
  return '';
};

const requestCivilViewHtml = (countyId, propertyId) =>
  propertyId ? fetchDetail(countyId, propertyId) : fetchListing(countyId);

module.exports = {
  requestCivilViewHtml,
  validateCivilViewParams,
};
