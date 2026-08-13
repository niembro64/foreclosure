import {
  CivilViewRecord,
  createPropertyMatchKey,
  createPropertyResearchLinks,
  parseCivilViewDetail,
  parseCivilViewListing,
} from './civilView';

const county = { id: 2, name: 'Essex' };

const listingHtml = (headers: string[], cells: string[]) => `
  <h1>Essex County, NJ - Foreclosure Sales Listing (last updated: 8/12/2026 8:52:00 PM)</h1>
  <table class="table table-striped">
    <thead><tr><th></th>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
    <tr>
      <td><a href="/Sales/SaleDetails?PropertyId=2096074373">View Details</a></td>
      ${cells.map((cell) => `<td>${cell}</td>`).join('')}
    </tr>
  </table>
`;

const makeRecord = (): CivilViewRecord =>
  parseCivilViewListing(
    listingHtml(
      ['Sheriff #', 'Sales Date', 'Plaintiff', 'Defendant', 'Address'],
      ['F-25000881', '8/12/2026', 'ATHENE', 'NEWARK REALTY', '64 CUTLER STREET NEWARK NJ 07104']
    ),
    county
  ).records[0];

describe('CivilView scraper', () => {
  test('parses the current listing table and source timestamp', () => {
    const result = parseCivilViewListing(
      listingHtml(
        ['Sheriff #', 'Sales Date', 'Plaintiff', 'Defendant', 'Address'],
        ['F-25000881', '8/12/2026', 'ATHENE', 'NEWARK REALTY', '64 CUTLER STREET NEWARK NJ 07104']
      ),
      county
    );

    expect(result.sourceUpdatedAt).toBe('8/12/2026 8:52:00 PM');
    expect(result.records[0]).toMatchObject({
      county: 'Essex',
      matchKey: 'NJ|64CUTLERSTNEWARKNJ07104',
      propertyId: '2096074373',
      sheriffNumber: 'F-25000881',
      saleDate: '8/12/2026',
      plaintiff: 'ATHENE',
      defendant: 'NEWARK REALTY',
      address: '64 CUTLER STREET NEWARK NJ 07104',
      detailStatus: 'pending',
    });
  });

  test('maps fields by header name when a county changes column order', () => {
    const result = parseCivilViewListing(
      listingHtml(
        ['Sheriff #', 'Sales Date', 'Address', 'Plaintiff', 'Defendant'],
        ['20048378', '8/13/2026', '11 STEVENSON PLACE KEARNY NJ', 'FINANCE OF AMERICA', 'MANUEL CAMPOS']
      ),
      { id: 10, name: 'Hudson' }
    );

    expect(result.records[0]).toMatchObject({
      county: 'Hudson',
      address: '11 STEVENSON PLACE KEARNY NJ',
      plaintiff: 'FINANCE OF AMERICA',
      defendant: 'MANUEL CAMPOS',
    });
  });

  test('uses the sale-notice upset price instead of the approximate amount due', () => {
    const detail = parseCivilViewDetail(
      `
        <h1>Sales Listing Detail (Essex County, NJ)</h1>
        <div class="sale-details-list">
          <div class="sale-detail-item"><div class="sale-detail-label">Court Case #:</div><div class="sale-detail-value">F747223 F</div></div>
          <div class="sale-detail-item"><div class="sale-detail-label">Address:</div><div class="sale-detail-value">64 CUTLER STREET<br>NEWARK NJ 07104</div></div>
          <div class="sale-detail-item"><div class="sale-detail-label">Description:</div><div class="sale-detail-value">GOOD FAITH ESTIMATE OF UPSET PRICE: $830,939.52. OCCUPANCY UNKNOWN.</div></div>
          <div class="sale-detail-item"><div class="sale-detail-label">Approx. Upset*:</div><div class="sale-detail-value">$756,564.68</div></div>
          <div class="sale-detail-item"><div class="sale-detail-label">Attorney:</div><div class="sale-detail-value">FEIN SUCH KAHN</div></div>
        </div>
        <table id="longTable"><tr><th>Status</th><th>Date</th></tr><tr><td>Scheduled</td><td>8/12/2026</td></tr></table>
      `,
      makeRecord()
    );

    expect(detail).toMatchObject({
      courtCaseNumber: 'F747223 F',
      address: '64 CUTLER STREET NEWARK NJ 07104',
      upsetPrice: '$830,939.52',
      upsetPriceNumber: 830939.52,
      upsetPriceSource: 'Sale notice',
      approximateAmountDue: '$756,564.68',
      attorney: 'FEIN SUCH KAHN',
      status: 'Scheduled',
      detailStatus: 'loaded',
    });
  });

  test('prefers a structured good-faith upset and reads the latest status', () => {
    const detail = parseCivilViewDetail(
      `
        <h1>Sales Listing Detail (Hudson County, NJ)</h1>
        <div class="sale-detail-item"><div class="sale-detail-label">Good Faith Upset*:</div><div class="sale-detail-value">$519,000.00, PLUS COSTS</div></div>
        <div class="sale-detail-item"><div class="sale-detail-label">Description:</div><div class="sale-detail-value">ESTIMATED UPSET BID AMOUNT: $337,000.00</div></div>
        <div class="sale-detail-item"><div class="sale-detail-label">Judgment:</div><div class="sale-detail-value">$363,604.83</div></div>
        <table id="longTable">
          <tr><th>Status</th><th>Date</th></tr>
          <tr><td>Scheduled</td><td>7/16/2026</td></tr>
          <tr><td>Adjourned - Plaintiff - New Sale Date:</td><td>8/13/2026</td></tr>
        </table>
      `,
      makeRecord()
    );

    expect(detail.upsetPrice).toBe('$519,000.00');
    expect(detail.upsetPriceSource).toBe('Good Faith Upset');
    expect(detail.judgmentAmount).toBe('$363,604.83');
    expect(detail.status).toBe('Adjourned - Plaintiff - New Sale Date:');
    expect(detail.statusHistory).toHaveLength(2);
  });

  test('creates non-scraping research links for the property address', () => {
    const links = createPropertyResearchLinks('64 CUTLER STREET NEWARK NJ 07104');

    expect(links.maps).toContain('64%20CUTLER%20STREET');
    expect(decodeURIComponent(links.zillow)).toContain('site:zillow.com');
    expect(decodeURIComponent(links.redfin)).toContain('site:redfin.com');
  });

  test('normalizes common address suffixes into a cross-source match key', () => {
    expect(createPropertyMatchKey('64 Cutler Street, Newark, New Jersey 07104')).toBe('NJ|64CUTLERSTNEWARKNJ07104');
    expect(createPropertyMatchKey('64 CUTLER ST NEWARK NJ 07104')).toBe('NJ|64CUTLERSTNEWARKNJ07104');
  });
});
