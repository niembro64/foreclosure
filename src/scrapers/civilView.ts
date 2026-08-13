export const CIVIL_VIEW_BASE_URL = 'https://salesweb.civilview.com';

export type CivilViewCounty = {
  id: number;
  name: string;
};

export const CIVIL_VIEW_COUNTIES: CivilViewCounty[] = [
  { id: 2, name: 'Essex' },
  { id: 17, name: 'Passaic' },
  { id: 10, name: 'Hudson' },
  { id: 15, name: 'Union' },
];

export type CivilViewStatusEvent = {
  status: string;
  date: string;
};

export type CivilViewDetailStatus = 'pending' | 'loading' | 'loaded' | 'error';

export type CivilViewRecord = {
  id: string;
  source: 'CivilView';
  countyId: number;
  county: string;
  matchKey: string;
  propertyId: string;
  sheriffNumber: string;
  courtCaseNumber: string;
  saleDate: string;
  status: string;
  plaintiff: string;
  defendant: string;
  address: string;
  upsetPrice: string;
  upsetPriceNumber: number;
  upsetPriceSource: string;
  judgmentAmount: string;
  approximateAmountDue: string;
  attorney: string;
  attorneyPhone: string;
  parcelNumber: string;
  propertyNote: string;
  description: string;
  statusHistory: CivilViewStatusEvent[];
  sourceUpdatedAt: string;
  searchUrl: string;
  detailUrl: string;
  detailStatus: CivilViewDetailStatus;
  errorMessage: string;
};

export type CivilViewListingResult = {
  records: CivilViewRecord[];
  sourceUpdatedAt: string;
};

export type PropertyResearchLinks = {
  maps: string;
  zillow: string;
  realtor: string;
  redfin: string;
  homes: string;
};

const normalizeText = (value: string): string =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeHeader = (value: string): string =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const getElementText = (element: Element | null): string => {
  if (!element) return '';
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((breakElement) => breakElement.replaceWith(' '));
  return normalizeText(clone.textContent || '');
};

const getCellValue = (
  cells: HTMLTableCellElement[],
  headerIndexes: Map<string, number>,
  ...headerNames: string[]
): string => {
  for (const headerName of headerNames) {
    const index = headerIndexes.get(normalizeHeader(headerName));
    if (index !== undefined) {
      return normalizeText(cells[index]?.textContent || '');
    }
  }
  return '';
};

const extractDollarAmount = (value: string): string =>
  value.match(/\$\s*[0-9][0-9,]*(?:\.\d{2})?/)?.[0].replace(/\s+/g, '') || '';

const dollarAmountToNumber = (value: string): number => {
  const number = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
};

const extractUpsetFromNarrative = (value: string): string => {
  const patterns = [
    /good\s+faith\s+estimate\s+of\s+upset\s+price\s*[:-]?\s*(\$\s*[0-9][0-9,]*(?:\.\d{2})?)/i,
    /estimated\s+upset\s+bid\s+amount\s*[:-]?\s*(\$\s*[0-9][0-9,]*(?:\.\d{2})?)/i,
    /upset\s+price\s*[:-]?\s*(\$\s*[0-9][0-9,]*(?:\.\d{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1].replace(/\s+/g, '');
  }
  return '';
};

export const getCivilViewSearchUrl = (countyId: number): string =>
  `${CIVIL_VIEW_BASE_URL}/Sales/SalesSearch?countyId=${countyId}`;

export const createPropertyMatchKey = (address: string): string =>
  `NJ|${normalizeText(address)
    .toUpperCase()
    .replace(/\bNEW JERSEY\b/g, 'NJ')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bTERRACE\b/g, 'TER')
    .replace(/[^A-Z0-9|]/g, '')}`;

export function parseCivilViewListing(htmlString: string, county: CivilViewCounty): CivilViewListingResult {
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const table = Array.from(doc.querySelectorAll('table')).find((candidate) =>
    candidate.querySelector("a[href*='SaleDetails?PropertyId=']")
  );

  const headingText = normalizeText(doc.querySelector('h1')?.textContent || '');
  const sourceUpdatedAt = headingText.match(/last updated:\s*([^)]+)/i)?.[1]?.trim() || '';

  if (!table) return { records: [], sourceUpdatedAt };

  const headers = Array.from(table.querySelectorAll('thead th')).map((header) =>
    normalizeHeader(header.textContent || '')
  );
  const headerIndexes = new Map(headers.map((header, index) => [header, index]));
  const searchUrl = getCivilViewSearchUrl(county.id);

  const records = Array.from(table.querySelectorAll('tr'))
    .map((row): CivilViewRecord | null => {
      const detailLink = row.querySelector<HTMLAnchorElement>("a[href*='SaleDetails?PropertyId=']");
      if (!detailLink) return null;

      const rawHref = detailLink.getAttribute('href') || '';
      const detailUrl = new URL(rawHref, CIVIL_VIEW_BASE_URL).toString();
      const propertyId = new URL(detailUrl).searchParams.get('PropertyId') || '';
      if (!propertyId) return null;

      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
      const address = getCellValue(cells, headerIndexes, 'Address');

      return {
        id: `${county.id}-${propertyId}`,
        source: 'CivilView',
        countyId: county.id,
        county: county.name,
        matchKey: createPropertyMatchKey(address),
        propertyId,
        sheriffNumber: getCellValue(cells, headerIndexes, 'Sheriff #'),
        courtCaseNumber: '',
        saleDate: getCellValue(cells, headerIndexes, 'Sales Date'),
        status: 'Open',
        plaintiff: getCellValue(cells, headerIndexes, 'Plaintiff'),
        defendant: getCellValue(cells, headerIndexes, 'Defendant'),
        address,
        upsetPrice: '',
        upsetPriceNumber: 0,
        upsetPriceSource: '',
        judgmentAmount: '',
        approximateAmountDue: '',
        attorney: '',
        attorneyPhone: '',
        parcelNumber: '',
        propertyNote: '',
        description: '',
        statusHistory: [],
        sourceUpdatedAt,
        searchUrl,
        detailUrl,
        detailStatus: 'pending',
        errorMessage: '',
      };
    })
    .filter((record): record is CivilViewRecord => record !== null);

  return { records, sourceUpdatedAt };
}

export function parseCivilViewDetail(htmlString: string, record: CivilViewRecord): CivilViewRecord {
  const doc = new DOMParser().parseFromString(htmlString, 'text/html');
  const heading = normalizeText(doc.querySelector('h1')?.textContent || '');
  if (!heading.toLowerCase().includes('sales listing detail')) {
    throw new Error('CivilView did not return a property detail page.');
  }

  const fields = new Map<string, string>();
  doc.querySelectorAll<HTMLElement>('.sale-detail-item').forEach((item) => {
    const label = normalizeHeader(item.querySelector('.sale-detail-label')?.textContent || '');
    const value = getElementText(item.querySelector('.sale-detail-value'));
    if (label) fields.set(label, value);
  });

  const getField = (...labels: string[]): string => {
    for (const label of labels) {
      const value = fields.get(normalizeHeader(label));
      if (value !== undefined) return value;
    }
    return '';
  };

  const statusHistory = Array.from(doc.querySelectorAll<HTMLTableRowElement>('#longTable tr'))
    .map((row): CivilViewStatusEvent | null => {
      const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
      if (cells.length < 2) return null;
      const status = normalizeText(cells[0].textContent || '');
      const date = normalizeText(cells[1].textContent || '');
      return status ? { status, date } : null;
    })
    .filter((event): event is CivilViewStatusEvent => event !== null);

  const description = getField('Description');
  const propertyNote = getField('Property Note');
  const goodFaithUpset = getField('Good Faith Upset');
  const narrativeUpset = extractUpsetFromNarrative(`${propertyNote} ${description}`);
  const approximateAmountDue = getField('Approx. Upset');
  const fallbackUpset = extractDollarAmount(approximateAmountDue);

  let upsetPrice = extractDollarAmount(goodFaithUpset);
  let upsetPriceSource = upsetPrice ? 'Good Faith Upset' : '';
  if (!upsetPrice && narrativeUpset) {
    upsetPrice = narrativeUpset;
    upsetPriceSource = 'Sale notice';
  }
  if (!upsetPrice && fallbackUpset) {
    upsetPrice = fallbackUpset;
    upsetPriceSource = 'Approx. Upset';
  }

  const latestStatus = statusHistory[statusHistory.length - 1]?.status || record.status;
  const address = getField('Address') || record.address;

  return {
    ...record,
    sheriffNumber: getField('Sheriff #') || record.sheriffNumber,
    courtCaseNumber: getField('Court Case #'),
    saleDate: getField('Sales Date') || record.saleDate,
    status: latestStatus,
    plaintiff: getField('Plaintiff') || record.plaintiff,
    defendant: getField('Defendant') || record.defendant,
    address,
    matchKey: createPropertyMatchKey(address),
    upsetPrice,
    upsetPriceNumber: dollarAmountToNumber(upsetPrice),
    upsetPriceSource,
    judgmentAmount: getField('Judgment'),
    approximateAmountDue,
    attorney: getField('Attorney'),
    attorneyPhone: getField('Attorney Phone'),
    parcelNumber: getField('Parcel #'),
    propertyNote,
    description,
    statusHistory,
    detailStatus: 'loaded',
    errorMessage: '',
  };
}

const siteSearchUrl = (domain: string, address: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} "${address}"`)}`;

export function createPropertyResearchLinks(address: string): PropertyResearchLinks {
  return {
    maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    zillow: siteSearchUrl('zillow.com', address),
    realtor: siteSearchUrl('realtor.com', address),
    redfin: siteSearchUrl('redfin.com', address),
    homes: siteSearchUrl('homes.com', address),
  };
}
