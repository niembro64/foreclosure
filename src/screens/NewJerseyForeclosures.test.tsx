import { fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { CivilViewRecord } from '../scrapers/civilView';
import NewJerseyForeclosures, { sortCivilViewRecords } from './NewJerseyForeclosures';

jest.mock('axios');

const makeRecord = (overrides: Partial<CivilViewRecord>): CivilViewRecord => ({
  id: 'record',
  source: 'CivilView',
  countyId: 10,
  county: 'Hudson',
  matchKey: 'NJ|RECORD',
  propertyId: '1',
  sheriffNumber: '',
  courtCaseNumber: '',
  saleDate: '8/20/2026',
  status: 'Scheduled',
  plaintiff: '',
  defendant: '',
  address: '123 MAIN STREET HOBOKEN NJ 07030',
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
  sourceUpdatedAt: '',
  searchUrl: '',
  detailUrl: '',
  detailStatus: 'loaded',
  errorMessage: '',
  ...overrides,
});

describe('New Jersey table sorting', () => {
  const records = [
    makeRecord({
      id: 'far',
      address: '1 TEST STREET ELIZABETH NJ 07201',
      upsetPrice: '$500,000',
      upsetPriceNumber: 500000,
    }),
    makeRecord({
      id: 'near',
      address: '2 TEST STREET HOBOKEN NJ 07030',
      upsetPrice: '$300,000',
      upsetPriceNumber: 300000,
    }),
    makeRecord({
      id: 'missing',
      county: 'Unknown',
      address: 'ADDRESS UNAVAILABLE',
      upsetPrice: '',
      upsetPriceNumber: 0,
    }),
  ];

  test('sorts numeric upset prices and leaves missing values last', () => {
    expect(
      sortCivilViewRecords(records, { key: 'upsetPrice', direction: 'descending' }).map((record) => record.id)
    ).toEqual(['far', 'near', 'missing']);
  });

  test('sorts by the Bronxville distance estimate', () => {
    expect(
      sortCivilViewRecords(records, { key: 'distance', direction: 'ascending' }).map((record) => record.id)
    ).toEqual(['near', 'far', 'missing']);
  });
});

describe('New Jersey table controls', () => {
  test('shows the CORS warning, applies the 25-mile default, and renders centered sortable statuses', async () => {
    (axios.get as jest.Mock).mockImplementation((_url, config) => {
      if (config?.params?.propertyId) {
        return Promise.resolve({
          headers: { 'x-civilview-proxy': '1' },
          data: `
            <h1>Sales Listing Detail (Hudson County, NJ)</h1>
            <div class="sale-detail-item"><div class="sale-detail-label">Address:</div><div class="sale-detail-value">2 TEST STREET HOBOKEN NJ 07030</div></div>
            <div class="sale-detail-item"><div class="sale-detail-label">Good Faith Upset*:</div><div class="sale-detail-value">$300,000.00</div></div>
            <table id="longTable">
              <tr><th>Status</th><th>Date</th></tr>
              <tr><td>Adjourned - Plaintiff - New Sale Date:</td><td>8/20/2026</td></tr>
            </table>
          `,
        });
      }

      return Promise.resolve({
        headers: { 'x-civilview-proxy': '1' },
        data: `
          <h1>Hudson County, NJ - Foreclosure Sales Listing</h1>
          <table>
            <thead><tr><th></th><th>Sheriff #</th><th>Sales Date</th><th>Plaintiff</th><th>Defendant</th><th>Address</th></tr></thead>
            <tr>
              <td><a href="/Sales/SaleDetails?PropertyId=123">View Details</a></td>
              <td>F-123</td><td>8/20/2026</td><td>BANK</td><td>OWNER</td><td>2 TEST STREET HOBOKEN NJ 07030</td>
            </tr>
          </table>
        `,
      });
    });

    render(<NewJerseyForeclosures />);

    expect(screen.getByRole('alert')).toHaveTextContent('Turn the CORS extension OFF for New Jersey');

    const countyCheckboxes = screen.getAllByRole('checkbox');
    fireEvent.click(countyCheckboxes[0]);
    fireEvent.click(countyCheckboxes[1]);
    fireEvent.click(countyCheckboxes[3]);
    fireEvent.click(screen.getByRole('button', { name: 'Load listings (1)' }));

    const matchingStatuses = await screen.findAllByText('Adjourned - Plaintiff - New Sale Date:');
    const status = matchingStatuses.find((element) => element.tagName === 'SPAN');
    expect(status).toBeDefined();
    expect(status).toHaveClass('justify-center', 'text-center', 'whitespace-normal');
    expect(screen.getByLabelText('Approximate distance from Bronxville')).toHaveValue(25);
    expect(screen.getByText('~17.1 mi')).toBeInTheDocument();

    const upsetPriceSort = screen.getByRole('button', { name: 'Upset price' });
    fireEvent.click(upsetPriceSort);
    expect(upsetPriceSort.closest('th')).toHaveAttribute('aria-sort', 'ascending');
  });
});
