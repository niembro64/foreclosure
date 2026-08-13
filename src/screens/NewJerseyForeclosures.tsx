import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { DEFAULT_DISTANCE_MILES, getNewJerseyDistance } from '../data/bronxvilleDistances';
import {
  CIVIL_VIEW_COUNTIES,
  CivilViewRecord,
  createPropertyResearchLinks,
  getCivilViewSearchUrl,
  parseCivilViewDetail,
  parseCivilViewListing,
} from '../scrapers/civilView';

type LoadProgress = {
  county: string;
  countiesCompleted: number;
  totalCounties: number;
  detailsCompleted: number;
  totalDetails: number;
};

type SortKey =
  | 'status'
  | 'county'
  | 'distance'
  | 'saleDate'
  | 'case'
  | 'address'
  | 'upsetPrice'
  | 'judgmentAmount'
  | 'plaintiff'
  | 'defendant'
  | 'attorney'
  | 'parcelNumber'
  | 'sourceUpdatedAt';

type SortDirection = 'ascending' | 'descending';

type SortConfig = {
  key: SortKey | null;
  direction: SortDirection | null;
};

const DETAIL_BATCH_SIZE = 4;
const CIVIL_VIEW_PROXY_URL = '/api/civilview';

const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const escapeCsvField = (value: string | number): string => {
  const stringValue = String(value ?? '');
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const statusClassName = (status: string): string => {
  const normalized = status.toLowerCase();
  if (/cancel|sold|bankrupt|stay|hold/.test(normalized)) {
    return 'border-red-700 bg-red-950 text-red-200';
  }
  if (/adjourn|postpone/.test(normalized)) {
    return 'border-yellow-700 bg-yellow-950 text-yellow-200';
  }
  return 'border-emerald-700 bg-emerald-950 text-emerald-200';
};

const parseSaleDate = (value: string): number => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
};

const parseDollarAmount = (value: string): number | null => {
  const amount = Number(value.replace(/[^0-9.-]/g, ''));
  return value && Number.isFinite(amount) ? amount : null;
};

const getSortValue = (record: CivilViewRecord, key: SortKey): string | number | null => {
  switch (key) {
    case 'status':
      return record.status.toLowerCase();
    case 'county':
      return record.county.toLowerCase();
    case 'distance':
      return getNewJerseyDistance(record.address, record.county)?.miles ?? null;
    case 'saleDate':
      return record.saleDate ? parseSaleDate(record.saleDate) : null;
    case 'case':
      return `${record.sheriffNumber} ${record.courtCaseNumber}`.trim().toLowerCase();
    case 'address':
      return record.address.toLowerCase();
    case 'upsetPrice':
      return record.upsetPrice ? record.upsetPriceNumber : null;
    case 'judgmentAmount':
      return parseDollarAmount(record.judgmentAmount || record.approximateAmountDue);
    case 'plaintiff':
      return record.plaintiff.toLowerCase();
    case 'defendant':
      return record.defendant.toLowerCase();
    case 'attorney':
      return record.attorney.toLowerCase();
    case 'parcelNumber':
      return record.parcelNumber.toLowerCase();
    case 'sourceUpdatedAt':
      return record.sourceUpdatedAt ? parseSaleDate(record.sourceUpdatedAt) : null;
  }
};

export const sortCivilViewRecords = (records: CivilViewRecord[], config: SortConfig): CivilViewRecord[] => {
  if (!config.key || !config.direction) {
    return [...records].sort((a, b) => {
      const dateDifference = parseSaleDate(a.saleDate) - parseSaleDate(b.saleDate);
      return dateDifference || a.county.localeCompare(b.county) || a.address.localeCompare(b.address);
    });
  }

  const direction = config.direction === 'ascending' ? 1 : -1;
  return [...records].sort((a, b) => {
    const aValue = getSortValue(a, config.key as SortKey);
    const bValue = getSortValue(b, config.key as SortKey);

    if (aValue === null || aValue === '') return bValue === null || bValue === '' ? 0 : 1;
    if (bValue === null || bValue === '') return -1;
    if (aValue < bValue) return -1 * direction;
    if (aValue > bValue) return direction;
    return parseSaleDate(a.saleDate) - parseSaleDate(b.saleDate) || a.address.localeCompare(b.address);
  });
};

type SortableHeaderProps = {
  label: string;
  sortKey: SortKey;
  sortConfig: SortConfig;
  onSort: (key: SortKey) => void;
  centered?: boolean;
};

const SortableHeader = ({ label, sortKey, sortConfig, onSort, centered = false }: SortableHeaderProps) => {
  const active = sortConfig.key === sortKey;
  const ariaSort = active ? (sortConfig.direction === 'ascending' ? 'ascending' : 'descending') : 'none';
  const indicator = !active ? '↕' : sortConfig.direction === 'ascending' ? '↑' : '↓';

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-3 ${centered ? 'text-center' : 'text-left'} ${active ? 'bg-blue-950 text-blue-200' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex w-full items-center gap-1.5 font-semibold uppercase hover:text-blue-200 ${
          centered ? 'justify-center text-center' : 'justify-start text-left'
        }`}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className={active ? 'text-blue-300' : 'text-gray-600 group-hover:text-gray-400'}>
          {indicator}
        </span>
      </button>
    </th>
  );
};

const loadCivilViewListingPage = async (
  countyId: number,
  directUrl: string
): Promise<{ html: string; useProxy: boolean }> => {
  try {
    const proxyResponse = await axios.get<string>(CIVIL_VIEW_PROXY_URL, {
      params: { countyId },
    });
    if (proxyResponse.headers['x-civilview-proxy'] === '1') {
      return { html: proxyResponse.data, useProxy: true };
    }
  } catch (proxyError) {
    // A static deployment may not provide the same-origin bridge.
  }

  try {
    const response = await axios.get<string>(directUrl, { withCredentials: true });
    return { html: response.data, useProxy: false };
  } catch (credentialedError) {
    // A wildcard CORS response cannot be combined with credentials. Preserve
    // listing-only mode when an extension is configured that way.
    const response = await axios.get<string>(directUrl);
    return { html: response.data, useProxy: false };
  }
};

const loadCivilViewDetailPage = async (record: CivilViewRecord, useProxy: boolean): Promise<string> => {
  if (useProxy) {
    const response = await axios.get<string>(CIVIL_VIEW_PROXY_URL, {
      params: { countyId: record.countyId, propertyId: record.propertyId },
    });
    if (response.headers['x-civilview-proxy'] !== '1') {
      throw new Error('The CivilView proxy was not available.');
    }
    return response.data;
  }

  const response = await axios.get<string>(record.detailUrl, { withCredentials: true });
  return response.data;
};

const NewJerseyForeclosures: React.FC = () => {
  const [selectedCountyIds, setSelectedCountyIds] = useState<number[]>(CIVIL_VIEW_COUNTIES.map((county) => county.id));
  const [records, setRecords] = useState<CivilViewRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [fetchedAt, setFetchedAt] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [countyFilter, setCountyFilter] = useState('all');
  const [distanceFromBronxville, setDistanceFromBronxville] = useState(DEFAULT_DISTANCE_MILES);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: null });
  const [progress, setProgress] = useState<LoadProgress>({
    county: '',
    countiesCompleted: 0,
    totalCounties: 0,
    detailsCompleted: 0,
    totalDetails: 0,
  });

  const toggleCounty = (countyId: number) => {
    setSelectedCountyIds((current) =>
      current.includes(countyId) ? current.filter((id) => id !== countyId) : [...current, countyId]
    );
  };

  const requestSort = (key: SortKey) => {
    if (sortConfig.key !== key) {
      setSortConfig({ key, direction: 'ascending' });
      return;
    }
    if (sortConfig.direction === 'ascending') {
      setSortConfig({ key, direction: 'descending' });
      return;
    }
    setSortConfig({ key: null, direction: null });
  };

  const resetFilters = () => {
    setQuery('');
    setCountyFilter('all');
    setStatusFilter('all');
    setDistanceFromBronxville(DEFAULT_DISTANCE_MILES);
    setSortConfig({ key: null, direction: null });
  };

  const loadForeclosures = async () => {
    const counties = CIVIL_VIEW_COUNTIES.filter((county) => selectedCountyIds.includes(county.id));
    if (counties.length === 0) {
      setErrors(['Select at least one county.']);
      return;
    }

    setIsLoading(true);
    setErrors([]);
    setRecords([]);
    setFetchedAt(new Date().toLocaleString());
    setProgress({
      county: counties[0].name,
      countiesCompleted: 0,
      totalCounties: counties.length,
      detailsCompleted: 0,
      totalDetails: 0,
    });

    const accumulatedRecords: CivilViewRecord[] = [];
    const loadErrors: string[] = [];
    let detailsCompleted = 0;
    let totalDetails = 0;

    for (let countyIndex = 0; countyIndex < counties.length; countyIndex++) {
      const county = counties[countyIndex];
      setProgress((current) => ({ ...current, county: county.name }));

      try {
        // CivilView stores the active county in its ASP.NET session. Keep
        // credentials enabled and finish one county's details before moving on.
        const listingPage = await loadCivilViewListingPage(county.id, getCivilViewSearchUrl(county.id));
        const listing = parseCivilViewListing(listingPage.html, county);
        const countyStartIndex = accumulatedRecords.length;

        accumulatedRecords.push(...listing.records);
        totalDetails += listing.records.length;
        setRecords([...accumulatedRecords]);
        setProgress((current) => ({ ...current, totalDetails }));

        if (listing.records.length === 0) {
          loadErrors.push(`${county.name}: CivilView returned no open listings.`);
        }

        for (let batchStart = 0; batchStart < listing.records.length; batchStart += DETAIL_BATCH_SIZE) {
          const batch = listing.records.slice(batchStart, batchStart + DETAIL_BATCH_SIZE);
          batch.forEach((record, batchIndex) => {
            accumulatedRecords[countyStartIndex + batchStart + batchIndex] = {
              ...record,
              detailStatus: 'loading',
            };
          });
          setRecords([...accumulatedRecords]);

          const enrichedBatch = await Promise.all(
            batch.map(async (record): Promise<CivilViewRecord> => {
              try {
                const detailHtml = await loadCivilViewDetailPage(record, listingPage.useProxy);
                return parseCivilViewDetail(detailHtml, record);
              } catch (error) {
                return {
                  ...record,
                  detailStatus: 'error',
                  errorMessage: 'Detail session blocked because the same-origin CivilView bridge was unavailable.',
                };
              }
            })
          );

          enrichedBatch.forEach((record, batchIndex) => {
            accumulatedRecords[countyStartIndex + batchStart + batchIndex] = record;
          });
          detailsCompleted += enrichedBatch.length;
          setRecords([...accumulatedRecords]);
          setProgress((current) => ({ ...current, detailsCompleted }));

          if (batchStart + DETAIL_BATCH_SIZE < listing.records.length) {
            await wait(250);
          }
        }
      } catch (error) {
        loadErrors.push(
          `${county.name}: the CivilView bridge failed. Turn the CORS extension off and confirm ${CIVIL_VIEW_PROXY_URL} is available.`
        );
      }

      setProgress((current) => ({
        ...current,
        countiesCompleted: countyIndex + 1,
      }));
    }

    const detailErrorCount = accumulatedRecords.filter((record) => record.detailStatus === 'error').length;
    if (detailErrorCount > 0) {
      loadErrors.push(
        `${detailErrorCount} detail page${detailErrorCount === 1 ? '' : 's'} could not be enriched; listing data and direct links are still available.`
      );
    }

    setErrors(loadErrors);
    setIsLoading(false);
  };

  const statuses = useMemo(
    () =>
      Array.from(new Set(records.map((record) => record.status).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [records]
  );

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingRecords = records
      .filter((record) => countyFilter === 'all' || record.county === countyFilter)
      .filter((record) => statusFilter === 'all' || record.status === statusFilter)
      .filter(
        (record) =>
          (getNewJerseyDistance(record.address, record.county)?.miles ?? Number.POSITIVE_INFINITY) <=
          distanceFromBronxville
      )
      .filter((record) => {
        if (!normalizedQuery) return true;
        return [
          record.address,
          record.sheriffNumber,
          record.courtCaseNumber,
          record.plaintiff,
          record.defendant,
          record.attorney,
          record.parcelNumber,
        ].some((value) => value.toLowerCase().includes(normalizedQuery));
      });

    return sortCivilViewRecords(matchingRecords, sortConfig);
  }, [countyFilter, distanceFromBronxville, query, records, sortConfig, statusFilter]);

  const downloadCsv = () => {
    if (filteredRecords.length === 0) return;

    const headers = [
      'County',
      'Approx. Distance from Bronxville (mi)',
      'Distance Basis',
      'Property Match Key',
      'Status',
      'Sale Date',
      'Sheriff Number',
      'Court Case Number',
      'Address',
      'Upset Price',
      'Upset Price Source',
      'Judgment Amount',
      'Approximate Amount Due',
      'Plaintiff',
      'Defendant/Borrower',
      'Attorney',
      'Attorney Phone',
      'Parcel Number',
      'Property Note',
      'Status History',
      'CivilView Detail URL',
      'CivilView County Search URL',
      'Source Updated At',
      'Detail Load Status',
    ];
    const rows = filteredRecords.map((record) => {
      const distance = getNewJerseyDistance(record.address, record.county);
      return [
        record.county,
        distance?.miles ?? '',
        distance?.basis ?? '',
        record.matchKey,
        record.status,
        record.saleDate,
        record.sheriffNumber,
        record.courtCaseNumber,
        record.address,
        record.upsetPrice,
        record.upsetPriceSource,
        record.judgmentAmount,
        record.approximateAmountDue,
        record.plaintiff,
        record.defendant,
        record.attorney,
        record.attorneyPhone,
        record.parcelNumber,
        record.propertyNote,
        record.statusHistory.map((event) => `${event.date}: ${event.status}`).join(' | '),
        record.detailUrl,
        record.searchUrl,
        record.sourceUpdatedAt,
        record.detailStatus,
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map((value) => escapeCsvField(value)).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `new-jersey-foreclosures-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  };

  const openCivilViewDetail = (record: CivilViewRecord) => {
    // A detail URL only works after CivilView has selected its county in the
    // visitor's session. Prime that session in the new tab, then navigate the
    // same tab to the requested property.
    const detailWindow = window.open('about:blank', '_blank');
    if (!detailWindow) return;
    detailWindow.opener = null;
    detailWindow.location.href = record.searchUrl;
    window.setTimeout(() => {
      detailWindow.location.href = record.detailUrl;
    }, 2000);
  };

  const detailLoaded = records.filter((record) => record.detailStatus === 'loaded').length;
  const upsetPricesFound = records.filter((record) => record.upsetPrice).length;
  const detailErrors = records.filter((record) => record.detailStatus === 'error').length;

  return (
    <div className="min-h-screen bg-gray-900 p-4 text-gray-100">
      <div className="mx-auto max-w-[1800px] py-6">
        <header className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            New Jersey sheriff sales
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Foreclosure Opportunity Monitor</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-400">
                Open CivilView sales from Essex, Passaic, Hudson, and Union counties, enriched from each property detail
                page with upset price, status history, case, attorney, and parcel information.
              </p>
            </div>
            {fetchedAt && <p className="text-xs text-gray-500">Fetched {fetchedAt}</p>}
          </div>
        </header>

        <section
          role="alert"
          className="mb-6 rounded-xl border-2 border-amber-500 bg-amber-950/70 p-4 text-amber-100 shadow-lg shadow-amber-950/20"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-2xl leading-none">
              ⚠
            </span>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wide">
                Turn the CORS extension OFF for New Jersey
              </h2>
              <p className="mt-1 text-sm text-amber-200">
                New Jersey detail pages use the app&apos;s same-origin session bridge. A CORS extension can rewrite that
                response and prevent upset prices from loading. Connecticut is the reverse: turn the extension back ON
                before using the Connecticut screen.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-gray-700 bg-gray-800 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Counties</h2>
              <p className="mt-1 text-sm text-gray-400">
                CivilView returns currently open listings. Choose a smaller set for a faster run.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadForeclosures}
                disabled={isLoading || selectedCountyIds.length === 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? 'Loading county data…' : `Load listings (${selectedCountyIds.length})`}
              </button>
              <button
                type="button"
                onClick={downloadCsv}
                disabled={filteredRecords.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export {filteredRecords.length || ''} CSV
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CIVIL_VIEW_COUNTIES.map((county) => {
              const selected = selectedCountyIds.includes(county.id);
              return (
                <label
                  key={county.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition ${
                    selected
                      ? 'border-emerald-500 bg-emerald-950/50 text-emerald-100'
                      : 'border-gray-600 bg-gray-900 text-gray-400'
                  }`}
                >
                  <span>
                    <span className="block font-semibold">{county.name} County</span>
                    <a
                      href={getCivilViewSearchUrl(county.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Open source ↗
                    </a>
                  </span>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleCounty(county.id)}
                    className="h-5 w-5 accent-emerald-500"
                  />
                </label>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-gray-600 bg-gray-900/70 p-3 text-xs text-gray-300">
            CivilView detail enrichment requires the same-origin bridge. If upset prices show “detail blocked,” confirm
            the CORS extension is off and restart the local dev server after updating. The Details action remains
            available as a manual fallback.
          </div>
        </section>

        {isLoading && (
          <section className="mb-6 rounded-xl border border-blue-800 bg-blue-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-blue-200">Loading {progress.county} County</span>
              <span className="text-blue-300">
                Counties {progress.countiesCompleted}/{progress.totalCounties} · Details {progress.detailsCompleted}/
                {progress.totalDetails}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded bg-gray-700">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: `${
                    progress.totalDetails ? Math.round((progress.detailsCompleted / progress.totalDetails) * 100) : 3
                  }%`,
                }}
              />
            </div>
          </section>
        )}

        {errors.length > 0 && (
          <section className="mb-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
            <h2 className="mb-2 font-semibold">Run notes</h2>
            <ul className="list-disc space-y-1 pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </section>
        )}

        {records.length > 0 && (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ['Listings loaded', records.length, 'text-white'],
                ['Visible records', filteredRecords.length, 'text-violet-300'],
                ['Details loaded', detailLoaded, 'text-blue-300'],
                ['Upset prices found', upsetPricesFound, 'text-emerald-300'],
                ['Detail errors', detailErrors, 'text-red-300'],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
                  <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </section>

            <section className="mb-4 rounded-xl border border-gray-700 bg-gray-800 p-4">
              <div className="flex flex-wrap gap-3">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search address, party, case, attorney…"
                  aria-label="Search New Jersey foreclosure records"
                  className="min-w-[280px] flex-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                />
                <select
                  value={countyFilter}
                  onChange={(event) => setCountyFilter(event.target.value)}
                  className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                  aria-label="Filter by county"
                >
                  <option value="all">All counties</option>
                  {CIVIL_VIEW_COUNTIES.map((county) => (
                    <option key={county.id} value={county.name}>
                      {county.name}
                    </option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                  aria-label="Filter by status"
                >
                  <option value="all">All statuses</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-900 px-3 py-1 text-sm text-gray-300">
                  <span>Within</span>
                  <input
                    type="number"
                    min="0"
                    max="250"
                    value={distanceFromBronxville}
                    onChange={(event) => setDistanceFromBronxville(Math.max(0, Number(event.target.value)))}
                    aria-label="Approximate distance from Bronxville"
                    className="w-16 bg-transparent py-1 text-right font-semibold text-white outline-none"
                  />
                  <span>mi of Bronxville</span>
                </label>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg border border-gray-600 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700"
                >
                  Reset filters
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                <span>
                  Showing {filteredRecords.length} of {records.length} listings. Distances are straight-line estimates
                  from Bronxville using the property ZIP centroid when available.
                </span>
                <span>Click a column heading to sort ascending, descending, or reset.</span>
              </div>
            </section>

            <section className="overflow-x-auto rounded-xl border border-gray-700 bg-gray-800">
              <table className="min-w-[1850px] divide-y divide-gray-700 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-gray-950 text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <SortableHeader
                      label="Status"
                      sortKey="status"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                      centered
                    />
                    <SortableHeader label="County" sortKey="county" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Distance" sortKey="distance" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader label="Sale date" sortKey="saleDate" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader
                      label="Sheriff / case"
                      sortKey="case"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    />
                    <SortableHeader label="Property" sortKey="address" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader
                      label="Upset price"
                      sortKey="upsetPrice"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    />
                    <SortableHeader
                      label="Judgment / approx."
                      sortKey="judgmentAmount"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    />
                    <SortableHeader
                      label="Plaintiff"
                      sortKey="plaintiff"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    />
                    <SortableHeader
                      label="Defendant / borrower"
                      sortKey="defendant"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    />
                    <SortableHeader label="Attorney" sortKey="attorney" sortConfig={sortConfig} onSort={requestSort} />
                    <SortableHeader
                      label="Parcel"
                      sortKey="parcelNumber"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    />
                    <SortableHeader
                      label="Source"
                      sortKey="sourceUpdatedAt"
                      sortConfig={sortConfig}
                      onSort={requestSort}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredRecords.map((record) => {
                    const research = createPropertyResearchLinks(record.address);
                    const distance = getNewJerseyDistance(record.address, record.county);
                    return (
                      <tr key={record.id} className="align-top hover:bg-gray-700/50">
                        <td className="w-[180px] px-4 py-4 text-center">
                          <span
                            className={`inline-flex max-w-[160px] items-center justify-center whitespace-normal rounded-full border px-2 py-1 text-center text-xs font-semibold leading-tight ${statusClassName(
                              record.status
                            )}`}
                          >
                            {record.status || 'Open'}
                          </span>
                          {record.detailStatus === 'loading' && (
                            <span className="mt-2 block text-xs text-blue-300">Loading detail…</span>
                          )}
                          {record.detailStatus === 'error' && (
                            <span className="mt-2 block text-center text-xs text-red-300">Detail blocked</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 font-semibold text-white">{record.county}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-gray-300">
                          {distance ? (
                            <span title={`Straight-line estimate using ${distance.basis} centroid`}>
                              ~{distance.miles} mi
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-gray-200">{record.saleDate || '—'}</td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-gray-100">{record.sheriffNumber || '—'}</p>
                          <p className="mt-1 text-xs text-gray-500">{record.courtCaseNumber || 'No case #'}</p>
                        </td>
                        <td className="max-w-[300px] px-4 py-4">
                          <p className="font-medium text-white">{record.address || '—'}</p>
                          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                            <a
                              href={research.maps}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                            >
                              Map
                            </a>
                            <a
                              href={research.zillow}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                            >
                              Zillow
                            </a>
                            <a
                              href={research.realtor}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                            >
                              Realtor
                            </a>
                            <a
                              href={research.redfin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                            >
                              Redfin
                            </a>
                            <a
                              href={research.homes}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                            >
                              Homes
                            </a>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="font-bold text-emerald-300">{record.upsetPrice || '—'}</p>
                          {record.upsetPriceSource && (
                            <p className="mt-1 text-xs text-gray-500">{record.upsetPriceSource}</p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-gray-300">
                          {record.judgmentAmount || record.approximateAmountDue || '—'}
                        </td>
                        <td className="max-w-[260px] px-4 py-4 text-xs text-gray-300">{record.plaintiff || '—'}</td>
                        <td className="max-w-[300px] px-4 py-4 text-xs text-gray-300">{record.defendant || '—'}</td>
                        <td className="max-w-[220px] px-4 py-4 text-xs text-gray-300">
                          <p>{record.attorney || '—'}</p>
                          {record.attorneyPhone && <p className="mt-1 text-gray-500">{record.attorneyPhone}</p>}
                        </td>
                        <td className="max-w-[180px] px-4 py-4 text-xs text-gray-300">{record.parcelNumber || '—'}</td>
                        <td className="px-4 py-4 text-xs">
                          <button
                            type="button"
                            onClick={() => openCivilViewDetail(record)}
                            className="font-semibold text-blue-400 hover:text-blue-300"
                          >
                            Details ↗
                          </button>
                          {record.sourceUpdatedAt && (
                            <p className="mt-2 max-w-[130px] text-gray-500">Updated {record.sourceUpdatedAt}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredRecords.length === 0 && (
                <p className="p-8 text-center text-sm text-gray-400">No records match these filters.</p>
              )}
            </section>
          </>
        )}

        <section className="mt-8 rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h2 className="text-lg font-semibold text-white">Additional source roadmap</h2>
          <p className="mt-2 max-w-4xl text-sm text-gray-400">
            The law-firm sites are retained as manual research sources for now. Gross Polowy and Friedman Vartolo
            require acceptance of terms that restrict copying or downloading; LOGS embeds a Power BI report. Automated
            valuation capture from Zillow, Realtor, Redfin, and Homes also needs licensed APIs or a permitted data
            provider. Each property row includes targeted research links without copying restricted content.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <a
              href="https://grosspolowy.com/resources/sales-search-page/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-gray-600 px-3 py-2 text-blue-300 hover:bg-gray-700"
            >
              Gross Polowy ↗
            </a>
            <a
              href="https://www.logs.com/ny-sales-report.html"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-gray-600 px-3 py-2 text-blue-300 hover:bg-gray-700"
            >
              LOGS Group ↗
            </a>
            <a
              href="https://friedmanvartolo.com/sales/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-gray-600 px-3 py-2 text-blue-300 hover:bg-gray-700"
            >
              Friedman Vartolo ↗
            </a>
          </div>
        </section>
      </div>
    </div>
  );
};

export default NewJerseyForeclosures;
