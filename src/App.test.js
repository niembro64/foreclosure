import { fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import App from './App';

jest.mock('axios');

test('renders foreclosure data returned by the town-list request', async () => {
  axios.get.mockResolvedValue({
    data: `
      <div id="ctl00_cphBody_Panel1">
        <a href="PendPostbyTownDetails.aspx?town=Stamford">Stamford</a>
        <span> (</span><span>2</span><span>)</span><br>
      </div>
    `,
  });

  render(<App />);

  expect(screen.getByRole('heading', { name: 'Connecticut Foreclosure Data' })).toBeInTheDocument();
  expect(await screen.findByText('Stamford (2)')).toBeInTheDocument();
  expect(screen.getByLabelText('Approximate distance from Bronxville')).toHaveValue(25);

  fireEvent.click(screen.getByRole('button', { name: 'New Jersey' }));
  expect(screen.getByRole('heading', { name: 'Foreclosure Opportunity Monitor' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Turn the CORS extension OFF for New Jersey');
});
