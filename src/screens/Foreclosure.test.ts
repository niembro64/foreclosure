import { extractCityInfo, extractPostingIds, parsePublicAuctionNotice } from './Foreclosure';

describe('Connecticut foreclosure HTML parsing', () => {
  test('extracts town counts from the current flat-list markup', () => {
    const html = `
      <div id="ctl00_cphBody_Panel1">
        <a href="PendPostbyTownDetails.aspx?town=Stamford">Stamford</a>
        <span> (</span><span>2</span><span>)</span><br>
        <a href="PendPostbyTownDetails.aspx?town=Bridgeport">Bridgeport</a>
        <span> (</span><span>19</span><span>)</span><br>
      </div>
    `;

    expect(extractCityInfo(html)).toEqual([
      { name: 'Stamford', count: 2 },
      { name: 'Bridgeport', count: 19 },
    ]);
  });

  test('continues to extract town counts from the older GridView markup', () => {
    const html = `
      <table>
        <tr>
          <td><a href="PendPostbyTownDetails.aspx?Town=Stamford">Stamford</a></td>
          <td><span id="cphBody_GridView1_lblTownCount_0">2</span></td>
        </tr>
      </table>
    `;

    expect(extractCityInfo(html)).toEqual([{ name: 'Stamford', count: 2 }]);
  });

  test('extracts posting IDs when ASP.NET prefixes the GridView ID', () => {
    const html = `
      <table id="ctl00_cphBody_GridView1">
        <tr><th>#</th><th>Date</th><th>Docket</th><th>Address</th><th></th></tr>
        <tr>
          <td>1</td><td>08/29/2026</td><td>FSTCV246070163S</td><td>123 Main St</td>
          <td><a href="PendPostDetailPublic.aspx?PostingId=55974">View Full Notice</a></td>
        </tr>
      </table>
    `;

    expect(extractPostingIds(html)).toEqual(['55974']);
  });

  test('extracts notice fields when ASP.NET prefixes the detail IDs', () => {
    const html = `
      <span id="ctl00_cphBody_uEfileCaseInfo1_lblCaseCap">BANK v. OWNER</span>
      <span id="ctl00_cphBody_uEfileCaseInfo1_lblFileDate">01/02/2026</span>
      <a id="ctl00_cphBody_uEfileCaseInfo1_hlnkDocketNo">FST-CV26-123-S</a>
      <span id="ctl00_cphBody_uEfileCaseInfo1_lblRetDate">01/20/2026</span>
      <a id="ctl00_cphBody_hlnktown1">Stamford</a>
      <span id="ctl00_cphBody_lblSaleDate">Aug 29, 2026</span>
      <span id="ctl00_cphBody_lblSaleTime">12:00 PM</span>
      <span id="ctl00_cphBody_lblInsp">10:00 AM</span>
      <span id="ctl00_cphBody_lblNoticeFrom">Aug 01, 2026</span>
      <span id="ctl00_cphBody_lblNoticeThru">Aug 30, 2026</span>
      <span id="ctl00_cphBody_lblHeading">PUBLIC AUCTION<br>ADDRESS: 123 Main St, Stamford, CT</span>
      <span id="ctl00_cphBody_lblBody">Certified check required in the amount of $53,000</span>
      <span id="ctl00_cphBody_lblCommittee">JANE LAWYER<br>Committee<br>PHONE: 2035551212<br>EMAIL: jane@example.com</span>
      <span id="ctl00_cphBody_lblStatus">Active</span>
      <img id="ctl00_cphBody_Img1" src="../ForeclosureUploads/filedpic/test.jpeg">
    `;

    expect(parsePublicAuctionNotice(html)).toMatchObject({
      caseCaption: 'BANK v. OWNER',
      docketNumber: 'FST-CV26-123-S',
      town: 'Stamford',
      saleDate: 'Aug 29, 2026',
      saleTime: '12:00 PM',
      address: '123 Main St, Stamford, CT',
      dollarAmountString: '$53,000',
      dollarAmountNumber: 53000,
      committeeName: 'JANE LAWYER',
      committeePhone: '2035551212',
      committeeEmail: 'jane@example.com',
      status: 'Active',
      propertyImageUrl: 'https://sso.eservices.jud.ct.gov/foreclosures/ForeclosureUploads/filedpic/test.jpeg',
    });
  });
});
