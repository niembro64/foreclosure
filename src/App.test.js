import { fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import App from './App';

jest.mock('axios');

beforeEach(() => {
  window.location.hash = '';
  axios.get.mockResolvedValue({
    data: `
      <div id="ctl00_cphBody_Panel1">
        <a href="PendPostbyTownDetails.aspx?town=Stamford">Stamford</a>
        <span> (</span><span>2</span><span>)</span><br>
      </div>
    `,
  });
});

test('opens New Jersey by default and allows switching to Connecticut', async () => {
  render(<App />);

  expect(screen.getByRole('link', { name: 'niemo.io' })).toHaveAttribute('href', 'https://niemo.io');
  expect(screen.queryByText('games.niemo.io')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'New Jersey Foreclosure Data' })).toBeInTheDocument();
  expect(screen.queryByText(/Turn the CORS extension OFF for New Jersey/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Connecticut' }));
  expect(screen.getByRole('heading', { name: 'Connecticut Foreclosure Data' })).toBeInTheDocument();
  expect(await screen.findByText('Stamford (2)')).toBeInTheDocument();
  expect(screen.getByLabelText('Approximate distance from Bronxville')).toHaveValue(25);
});

test('preserves the explicit Connecticut hash link', async () => {
  window.location.hash = '#connecticut';
  render(<App />);

  expect(screen.getByRole('heading', { name: 'Connecticut Foreclosure Data' })).toBeInTheDocument();
  expect(await screen.findByText('Stamford (2)')).toBeInTheDocument();
});
