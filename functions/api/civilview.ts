type PagesFunctionContext = {
  request: Request;
};

type UpstreamSession = {
  alb: string;
  albCors: string;
  aspNet: string;
};

const CIVIL_VIEW_ORIGIN = 'https://salesweb.civilview.com';
const ALLOWED_COUNTIES = new Set(['2', '10', '15', '17']);

const getSetCookieValue = (setCookieHeader: string, name: string): string => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return setCookieHeader.match(new RegExp(`${escapedName}=([^;,\\s]+)`))?.[1] || '';
};

const getUpstreamSession = (headers: Headers): UpstreamSession => {
  const cookieHeaders = headers as Headers & {
    getSetCookie?: () => string[];
    getAll?: (name: string) => string[];
  };
  const setCookieHeader =
    cookieHeaders.getSetCookie?.().join(',') ||
    cookieHeaders.getAll?.('set-cookie').join(',') ||
    headers.get('set-cookie') ||
    '';
  return {
    alb: getSetCookieValue(setCookieHeader, 'AWSALB'),
    albCors: getSetCookieValue(setCookieHeader, 'AWSALBCORS'),
    aspNet: getSetCookieValue(setCookieHeader, 'ASP.NET_SessionId'),
  };
};

const parseCookies = (request: Request): Map<string, string> => {
  const cookies = new Map<string, string>();
  (request.headers.get('cookie') || '').split(';').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  });
  return cookies;
};

const getStoredSession = (request: Request, countyId: string): UpstreamSession => {
  const cookies = parseCookies(request);
  return {
    alb: cookies.get(`cv_${countyId}_alb`) || '',
    albCors: cookies.get(`cv_${countyId}_albcors`) || '',
    aspNet: cookies.get(`cv_${countyId}_asp`) || '',
  };
};

const hasSession = (session: UpstreamSession): boolean => Boolean(session.aspNet);

const upstreamCookieHeader = (session: UpstreamSession): string =>
  [
    session.alb && `AWSALB=${session.alb}`,
    session.albCors && `AWSALBCORS=${session.albCors}`,
    session.aspNet && `ASP.NET_SessionId=${session.aspNet}`,
  ]
    .filter(Boolean)
    .join('; ');

const appendSessionCookies = (headers: Headers, countyId: string, session: UpstreamSession) => {
  const attributes = 'Path=/api/civilview; Max-Age=3600; HttpOnly; Secure; SameSite=Lax';
  if (session.alb) {
    headers.append('Set-Cookie', `cv_${countyId}_alb=${encodeURIComponent(session.alb)}; ${attributes}`);
  }
  if (session.albCors) {
    headers.append('Set-Cookie', `cv_${countyId}_albcors=${encodeURIComponent(session.albCors)}; ${attributes}`);
  }
  if (session.aspNet) {
    headers.append('Set-Cookie', `cv_${countyId}_asp=${encodeURIComponent(session.aspNet)}; ${attributes}`);
  }
};

const fetchCountyListing = async (countyId: string): Promise<{ html: string; session: UpstreamSession }> => {
  const response = await fetch(`${CIVIL_VIEW_ORIGIN}/Sales/SalesSearch?countyId=${countyId}`, {
    headers: { 'User-Agent': 'games.niemo.io foreclosure monitor' },
  });
  if (!response.ok) throw new Error(`CivilView listing returned HTTP ${response.status}`);
  return {
    html: await response.text(),
    session: getUpstreamSession(response.headers),
  };
};

const fetchPropertyDetail = async (propertyId: string, session: UpstreamSession): Promise<string> => {
  const response = await fetch(`${CIVIL_VIEW_ORIGIN}/Sales/SaleDetails?PropertyId=${propertyId}`, {
    headers: {
      Cookie: upstreamCookieHeader(session),
      'User-Agent': 'games.niemo.io foreclosure monitor',
    },
  });
  if (!response.ok) throw new Error(`CivilView detail returned HTTP ${response.status}`);
  return response.text();
};

const htmlResponse = (html: string, countyId: string, session: UpstreamSession): Response => {
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-CivilView-Proxy': '1',
  });
  appendSessionCookies(headers, countyId, session);
  return new Response(html, { status: 200, headers });
};

export async function onRequestGet(context: PagesFunctionContext): Promise<Response> {
  const url = new URL(context.request.url);
  const countyId = url.searchParams.get('countyId') || '';
  const propertyId = url.searchParams.get('propertyId') || '';

  if (!ALLOWED_COUNTIES.has(countyId)) {
    return new Response('Unsupported county.', { status: 400 });
  }
  if (propertyId && !/^\d{1,20}$/.test(propertyId)) {
    return new Response('Invalid property ID.', { status: 400 });
  }

  try {
    if (!propertyId) {
      const listing = await fetchCountyListing(countyId);
      return htmlResponse(listing.html, countyId, listing.session);
    }

    let session = getStoredSession(context.request, countyId);
    if (!hasSession(session)) {
      session = (await fetchCountyListing(countyId)).session;
    }

    let html = await fetchPropertyDetail(propertyId, session);
    if (!html.toLowerCase().includes('sales listing detail')) {
      session = (await fetchCountyListing(countyId)).session;
      html = await fetchPropertyDetail(propertyId, session);
    }
    if (!html.toLowerCase().includes('sales listing detail')) {
      throw new Error('CivilView did not return the requested detail page.');
    }

    return htmlResponse(html, countyId, session);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CivilView request failed.';
    return new Response(message, {
      status: 502,
      headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
