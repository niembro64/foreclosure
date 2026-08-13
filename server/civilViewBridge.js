const axios = require('axios');

const CIVIL_VIEW_ORIGIN = 'https://salesweb.civilview.com';
const ALLOWED_COUNTIES = new Set(['2', '10', '15', '17']);
const countySessions = new Map();

const getCookieValue = (setCookieHeaders, name) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return setCookieHeaders.join(',').match(new RegExp(`${escapedName}=([^;,\\s]+)`))?.[1] || '';
};

const readSession = (headers) => {
  const setCookieHeaders = Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [];
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

const fetchListing = async (countyId) => {
  const response = await axios.get(`${CIVIL_VIEW_ORIGIN}/Sales/SalesSearch`, {
    params: { countyId },
    responseType: 'text',
    timeout: 30000,
    headers: { 'User-Agent': 'games.niemo.io foreclosure CivilView bridge' },
  });
  const session = readSession(response.headers);
  if (!session.aspNet) {
    throw new Error('CivilView did not create an ASP.NET session.');
  }
  countySessions.set(countyId, session);
  return response.data;
};

const fetchDetail = async (countyId, propertyId) => {
  let session = countySessions.get(countyId);
  if (!session?.aspNet) {
    await fetchListing(countyId);
    session = countySessions.get(countyId);
  }

  const requestDetail = () =>
    axios.get(`${CIVIL_VIEW_ORIGIN}/Sales/SaleDetails`, {
      params: { PropertyId: propertyId },
      responseType: 'text',
      timeout: 30000,
      headers: {
        Cookie: cookieHeader(session),
        Referer: `${CIVIL_VIEW_ORIGIN}/Sales/SalesSearch?countyId=${countyId}`,
        'User-Agent': 'games.niemo.io foreclosure CivilView bridge',
      },
    });

  let response = await requestDetail();
  if (!response.data.toLowerCase().includes('sales listing detail')) {
    await fetchListing(countyId);
    session = countySessions.get(countyId);
    response = await requestDetail();
  }
  if (!response.data.toLowerCase().includes('sales listing detail')) {
    throw new Error('CivilView did not return the requested detail page.');
  }
  return response.data;
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
