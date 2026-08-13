import { DEFAULT_DISTANCE_MILES, getConnecticutDistance, getNewJerseyDistance } from './bronxvilleDistances';

describe('Bronxville straight-line distance estimates', () => {
  test('uses 25 miles as the shared default', () => {
    expect(DEFAULT_DISTANCE_MILES).toBe(25);
  });

  test('uses Connecticut town centroids rather than the old Greenwich origin', () => {
    expect(getConnecticutDistance('Greenwich')).toEqual({ miles: 12.4, basis: 'town' });
    expect(getConnecticutDistance('Stamford')).toEqual({ miles: 17.5, basis: 'town' });
    expect(getConnecticutDistance('Norwalk')).toEqual({ miles: 23.7, basis: 'town' });
    expect(getConnecticutDistance('Bridgeport')).toEqual({ miles: 37.1, basis: 'town' });
  });

  test('prefers an NJ property ZIP and falls back to its county', () => {
    expect(getNewJerseyDistance('123 MAIN STREET HOBOKEN NJ 07030', 'Hudson')).toEqual({
      miles: 17.1,
      basis: 'ZIP',
    });
    expect(getNewJerseyDistance('ADDRESS UNAVAILABLE', 'Union')).toEqual({
      miles: 31.8,
      basis: 'county',
    });
  });
});
