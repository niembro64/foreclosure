import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DEFAULT_DISTANCE_MILES, getConnecticutDistance } from '../data/bronxvilleDistances';

const findNumbersAndMakePhoneNumber = (str: string): string => {
  let numbersString = '';

  // go through each character in the string, only add if it is a number
  for (let i = 0; i < str.length; i++) {
    const char = str.charAt(i);
    if (char >= '0' && char <= '9') {
      numbersString += char;
    }
  }

  // check if the string is 10 digits long
  if (numbersString.length === 10) {
    // format the string as a phone number
    return `(${numbersString.slice(0, 3)}) ${numbersString.slice(3, 6)}-${numbersString.slice(6)}`;
  } else {
    // if not, return the original string
    return str;
  }
};

const numberToDollarAmountString = (number: number): string => {
  if (isNaN(number)) return '';

  // don't show cents if it's a whole number
  const formattedNumber = number.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  });
  return formattedNumber;
};

// Define types for the data we'll work with
type PublicAuctionNotice = {
  // Case/filing details
  caseCaption: string;
  fileDate: string;
  docketNumber: string;
  returnDate: string;

  // Sale information
  town: string;
  saleDate: string;
  saleTime: string;
  inspectionCommencingAt: string;
  noticeFrom: string;
  noticeThru: string;

  // Notice details
  heading: string;
  body: string;

  // Committee contact
  committee: string;

  // Sale status (e.g., whether it is cancelled)
  status: string;
  address: string;

  // New field: dollar amount found in the
  dollarAmountString: string;
  dollarAmountNumber: number;

  // Detailed committee information
  committeeName: string;
  committeePhone: string;
  committeeEmail: string;

  // Absolute URL of the property photo embedded on the notice page (if any).
  propertyImageUrl: string;
};

type CityInfo = {
  name: string;
  count: number;
};

type PostingInfo = {
  postingId: string;
  city: string;
  status: 'pending' | 'loading' | 'loaded' | 'error' | 'missing';
  auctionNotice?: PublicAuctionNotice;
  errorMessage?: string;
};

// ASP.NET naming containers may prepend generated segments such as `ctl00_` to
// server-control IDs. Match the stable suffix so the parser works with either
// the prefixed or unprefixed markup returned by the judicial site.
const getElementByStableId = (doc: Document, stableId: string): HTMLElement | null =>
  doc.getElementById(stableId) ?? doc.querySelector<HTMLElement>(`[id$="${stableId}"]`);

export function parsePublicAuctionNotice(htmlString: string): PublicAuctionNotice {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Helper function to get the trimmed text content by element ID.
  const getText = (id: string): string => {
    const element = getElementByStableId(doc, id);
    return element ? (element.textContent?.trim() ?? '') : '';
  };

  // --- Retain original logic for extracting the address ---
  let address = '';
  const headingElement = getElementByStableId(doc, 'cphBody_lblHeading');
  if (headingElement) {
    const headingHtml = headingElement.innerHTML;
    // Look for "ADDRESS:" followed by optional <br> tags and capture the text
    const addressRegex = /ADDRESS:\s*(?:<br\s*\/?>\s*)*([^<]+)/i;
    const match = headingHtml.match(addressRegex);
    if (match) {
      address = match[1].trim();
      // Optionally check if a second line exists to append
      const afterMatch = headingHtml.split(match[0])[1];
      if (afterMatch) {
        const secondLineMatch = afterMatch.match(/<br\s*\/?>\s*([^<]+)/i);
        if (secondLineMatch && secondLineMatch[1].trim() !== '') {
          address += ', ' + secondLineMatch[1].trim();
        }
      }
    }
  }
  if (!address) {
    const addressRegex2 = /ADDRESS:\s*(?:<br\s*\/?>\s*)*([^<]+)/i;
    const fullMatch = htmlString.match(addressRegex2);
    if (fullMatch) {
      address = fullMatch[1].trim();
    }
  }

  // --- Original extraction for the dollar amount ---
  const dollarAmountFound = htmlString.match(/\$[0-9,]+(\.[0-9]{2})?/)?.[0] || '';

  // Parse committee fields we actually render: name (line 0), phone, email.
  let committeeName = '';
  let committeePhone = '';
  let committeeEmail = '';

  const committeeElement = getElementByStableId(doc, 'cphBody_lblCommittee');
  const committeeOriginal = committeeElement ? committeeElement.textContent?.trim() || '' : '';

  if (committeeElement) {
    const committeeLines = committeeElement.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (committeeLines.length > 0) {
      committeeName = committeeLines[0];
    }
    committeeLines.forEach((line) => {
      if (line.toUpperCase().startsWith('PHONE:')) {
        committeePhone = line.split(':')[1]?.trim() || '';
      } else if (line.toUpperCase().startsWith('EMAIL:')) {
        committeeEmail = line.split(':')[1]?.trim() || '';
      }
    });
  }

  // Property photo embedded on the notice page. The src is relative
  // ("../ForeclosureUploads/filedpic/…"), resolve against the known notice
  // path to get an absolute URL the browser can load directly.
  const imgEl = getElementByStableId(doc, 'cphBody_Img1') as HTMLImageElement | null;
  const rawImgSrc = imgEl?.getAttribute('src') || '';
  const propertyImageUrl = rawImgSrc
    ? new URL(rawImgSrc, 'https://sso.eservices.jud.ct.gov/foreclosures/Public/PendPostDetailPublic.aspx').toString()
    : '';

  // --- Return the combined auction notice object ---
  return {
    // --- Existing fields (untouched) ---
    caseCaption: getText('cphBody_uEfileCaseInfo1_lblCaseCap'),
    fileDate: getText('cphBody_uEfileCaseInfo1_lblFileDate'),
    docketNumber: getText('cphBody_uEfileCaseInfo1_hlnkDocketNo'),
    returnDate: getText('cphBody_uEfileCaseInfo1_lblRetDate'),
    town: getText('cphBody_hlnktown1'),
    saleDate: getText('cphBody_lblSaleDate'),
    saleTime: getText('cphBody_lblSaleTime'),
    inspectionCommencingAt: getText('cphBody_lblInsp'),
    noticeFrom: getText('cphBody_lblNoticeFrom'),
    noticeThru: getText('cphBody_lblNoticeThru'),
    heading: getText('cphBody_lblHeading'),
    body: getText('cphBody_lblBody'),
    // Original committee field remains untouched.
    committee: committeeOriginal,
    status: getText('cphBody_lblStatus'),
    address: address,
    dollarAmountString: dollarAmountFound,
    dollarAmountNumber: parseFloat(dollarAmountFound.replace(/[^0-9.-]+/g, '')),

    // --- New, more granular committee fields ---
    committeeName: committeeName,

    // committeeStreetAddress: committeeStreetAddress,

    committeePhone: committeePhone,

    committeeEmail: committeeEmail,

    propertyImageUrl: propertyImageUrl,
  };
}

// Function to properly capitalize names
function capitalizeEachWord(str: string): string {
  if (!str) return '';
  return str
    .split(' ')
    .map((word) => {
      // Apply capitalization rule to all words, including those in all caps
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

// Extract posting IDs from city pages
export function extractPostingIds(htmlString: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Get the table that holds the foreclosure sales records
  const salesTable = getElementByStableId(doc, 'cphBody_GridView1');
  if (!salesTable) {
    return [];
  }

  // Get all the rows in the table
  const rows = salesTable.querySelectorAll('tr');
  const postingIds: string[] = [];

  // Iterate over each row. Skip the header row (which contains <th> elements).
  rows.forEach((row) => {
    if (row.querySelector('th')) {
      return; // Skip header row
    }

    const cells = row.querySelectorAll('td');
    if (cells.length < 5) {
      return;
    }

    // Extract the "View Full Notice" URL from the fifth cell
    const viewNoticeLink = cells[4].querySelector('a');
    const viewFullNoticeUrl = viewNoticeLink?.getAttribute('href') || '';

    // Extract the posting_id from the URL query parameter
    let postingId = '';
    if (viewFullNoticeUrl) {
      const queryPart = viewFullNoticeUrl.split('?')[1];
      if (queryPart) {
        postingId = new URLSearchParams(queryPart).get('PostingId') || '';
      }
    }

    if (postingId) {
      postingIds.push(postingId);
    }
  });

  return postingIds;
}

// Extract city names and counts from the main page
export function extractCityInfo(htmlString: string): CityInfo[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Select all anchor elements linking to a town-details page. The site switched
  // the query param from `town=` to `Town=`, so match case-insensitively.
  const cityLinks = doc.querySelectorAll("a[href*='PendPostbyTownDetails.aspx?' i]");

  const cities: CityInfo[] = [];

  // Support both known layouts: the older GridView rows with an identified
  // count span and the current flat list whose count is split across anonymous
  // sibling spans immediately following each town link.
  cityLinks.forEach((link) => {
    const name = link.textContent?.trim() || '';

    const row = link.closest('tr');
    const countSpan = row?.querySelector("span[id*='lblTownCount']");

    let countText = countSpan?.textContent || '';
    if (!countText) {
      let sibling = link.nextSibling;
      while (sibling && sibling.nodeName !== 'BR' && sibling.nodeName !== 'A') {
        countText += sibling.textContent || '';
        sibling = sibling.nextSibling;
      }
    }

    const count = parseInt(countText.match(/\d+/)?.[0] || '0', 10);

    if (name) {
      cities.push({ name, count });
    }
  });

  return cities;
}

const Foreclosure = () => {
  // State variables
  const [cityList, setCityList] = useState<CityInfo[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [postings, setPostings] = useState<PostingInfo[]>([]);
  const [fetchingCities, setFetchingCities] = useState(true);
  const [fetchingPostings, setFetchingPostings] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string>('');
  const [distanceFromBronxville, setDistanceFromBronxville] = useState<number>(DEFAULT_DISTANCE_MILES);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState<boolean>(false);
  const [selectedAuction, setSelectedAuction] = useState<PublicAuctionNotice | null>(null);
  const [emailCopied, setEmailCopied] = useState<boolean>(false);
  const [expandedNotices, setExpandedNotices] = useState<Set<string>>(new Set());

  const toggleInSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [sortConfig, setSortConfig] = useState<{
    key: string | null;
    direction: 'ascending' | 'descending' | null;
  }>({ key: null, direction: null });
  const [progress, setProgress] = useState({
    completed: 0,
    total: 0,
    citiesProcessed: 0,
    totalCities: 0,
  });

  // Fetch initial city list data
  const fetchCityList = async () => {
    try {
      setFetchingCities(true);
      setError(null);
      setTimestamp(new Date().toLocaleString());

      // Fetch the main page that lists all cities
      const response = await axios.get('https://sso.eservices.jud.ct.gov/foreclosures/Public/PendPostbyTownList.aspx');

      // Extract city information
      const cities = extractCityInfo(response.data);
      setCityList(cities);
      console.log(`Fetched ${cities.length} cities`);
    } catch (err) {
      setError(
        'Failed to fetch city list. Do you have the CORS extension on? You can find it here, or you can find it yourself: https://chromewebstore.google.com/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf'
      );
      console.error('Error fetching city list:', err);
    } finally {
      setFetchingCities(false);
    }
  };

  // Process selected cities to fetch posting IDs and then details
  const processSelectedCities = async () => {
    if (selectedCities.length === 0) {
      setError('Please select at least one city first.');
      return;
    }

    try {
      setError(null);
      setFetchingPostings(true);
      setPostings([]); // Clear previous postings

      // Step 1: Get the cities to fetch
      const citiesToFetch = cityList.filter((city) => selectedCities.includes(city.name));

      setProgress({
        completed: 0,
        total: 0,
        citiesProcessed: 0,
        totalCities: citiesToFetch.length,
      });

      console.log(`Processing ${citiesToFetch.length} cities...`);

      // Step 2: Fetch posting IDs for all selected cities
      const allPostingIds: { city: string; postingIds: string[] }[] = [];

      for (const city of citiesToFetch) {
        try {
          setProgress((prev) => ({
            ...prev,
            citiesProcessed: prev.citiesProcessed + 1,
          }));

          // Construct the URL for the city's foreclosure data
          const url = `https://sso.eservices.jud.ct.gov/foreclosures/Public/PendPostbyTownDetails.aspx?town=${encodeURIComponent(city.name)}`;

          // Fetch the city page
          const response = await axios.get(url);

          // Extract posting IDs
          const postingIds = extractPostingIds(response.data);
          allPostingIds.push({ city: city.name, postingIds });

          console.log(`Found ${postingIds.length} postings for ${city.name}`);
        } catch (err) {
          console.error(`Error fetching data for ${city.name}:`, err);
        }
      }

      // Step 3: Flatten all posting IDs and prepare for fetching details
      const allPostings: PostingInfo[] = [];

      allPostingIds.forEach(({ city, postingIds }) => {
        postingIds.forEach((postingId) => {
          allPostings.push({
            postingId,
            city,
            status: 'pending',
          });
        });
      });

      // Update state with all posting IDs
      setPostings(allPostings);
      setFetchingPostings(false);

      // Step 4: Start fetching details for all postings
      if (allPostings.length > 0) {
        setFetchingDetails(true);
        setProgress({
          completed: 0,
          total: allPostings.length,
          citiesProcessed: citiesToFetch.length,
          totalCities: citiesToFetch.length,
        });

        // Process postings in batches to avoid overwhelming the server
        const batchSize = 5;
        const totalBatches = Math.ceil(allPostings.length / batchSize);

        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const batchStart = batchIndex * batchSize;
          const batchEnd = Math.min(batchStart + batchSize, allPostings.length);
          const batch = allPostings.slice(batchStart, batchEnd);

          console.log(`Processing batch ${batchIndex + 1}/${totalBatches}, items ${batchStart + 1}-${batchEnd}`);

          // Mark items in this batch as loading
          setPostings((prevPostings) => {
            const updatedPostings = [...prevPostings];
            for (let i = batchStart; i < batchEnd; i++) {
              if (i < updatedPostings.length) {
                updatedPostings[i] = {
                  ...updatedPostings[i],
                  status: 'loading',
                };
              }
            }
            return updatedPostings;
          });

          // Fetch details for each posting in the batch concurrently
          await Promise.all(
            batch.map(async (posting, index) => {
              try {
                const url = `https://sso.eservices.jud.ct.gov/foreclosures/Public/PendPostDetailPublic.aspx?PostingId=${posting.postingId}`;
                const response = await axios.get(url);

                // Check if the page indicates "No data found"
                if (response.data.includes('No data found')) {
                  setPostings((prevPostings) => {
                    const updatedPostings = [...prevPostings];
                    const postingIndex = batchStart + index;
                    if (postingIndex < updatedPostings.length) {
                      updatedPostings[postingIndex] = {
                        ...updatedPostings[postingIndex],
                        // auctionNotice: null, // or provide a default empty object if needed
                        status: 'missing',
                      };
                    }
                    return updatedPostings;
                  });
                  setProgress((prev) => ({
                    ...prev,
                    completed: prev.completed + 1,
                  }));
                  return; // Skip further processing for this posting
                }

                // Parse auction notice details if data is available
                const auctionNotice = parsePublicAuctionNotice(response.data);

                setPostings((prevPostings) => {
                  const updatedPostings = [...prevPostings];
                  const postingIndex = batchStart + index;
                  if (postingIndex < updatedPostings.length) {
                    updatedPostings[postingIndex] = {
                      ...updatedPostings[postingIndex],
                      auctionNotice,
                      status: 'loaded',
                    };
                  }
                  return updatedPostings;
                });

                setProgress((prev) => ({
                  ...prev,
                  completed: prev.completed + 1,
                }));
              } catch (err) {
                // Update posting with error information
                setPostings((prevPostings) => {
                  const updatedPostings = [...prevPostings];
                  const postingIndex = batchStart + index;
                  if (postingIndex < updatedPostings.length) {
                    updatedPostings[postingIndex] = {
                      ...updatedPostings[postingIndex],
                      status: 'error',
                      errorMessage: 'Failed to load auction details',
                    };
                  }
                  return updatedPostings;
                });

                setProgress((prev) => ({
                  ...prev,
                  completed: prev.completed + 1,
                }));

                console.error(`Error fetching details for posting ID ${posting.postingId}:`, err);
              }
            })
          );

          // Small delay between batches to be nice to the server
          if (batchIndex < totalBatches - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        setFetchingDetails(false);
      }
    } catch (err) {
      setError('An error occurred while processing the selected cities.');
      console.error('Error processing cities:', err);
      setFetchingPostings(false);
      setFetchingDetails(false);
    }
  };

  // Toggle selection of a city
  const handleCitySelection = (cityName: string) => {
    setSelectedCities((prev) => {
      if (prev.includes(cityName)) {
        return prev.filter((name) => name !== cityName);
      }
      return [...prev, cityName];
    });
  };

  // Select all cities
  const selectAllCities = () => {
    setSelectedCities(cityList.map((city) => city.name));
  };

  // Select cities within the approximate straight-line distance from Bronxville.
  const selectCitiesByDistance = (distance: number) => {
    const availableCitiesWithinDistance = cityList
      .filter((city) => (getConnecticutDistance(city.name)?.miles ?? Number.POSITIVE_INFINITY) <= distance)
      .map((city) => city.name);

    setSelectedCities(availableCitiesWithinDistance);
  };

  // Update city selection when distance changes
  useEffect(() => {
    if (cityList.length > 0) {
      selectCitiesByDistance(distanceFromBronxville);
    }
  }, [distanceFromBronxville, cityList]);

  // Clear city selection
  const clearCitySelection = () => {
    setSelectedCities([]);
  };

  // Load initial city list on component mount
  useEffect(() => {
    fetchCityList();
  }, []);

  // Format sale date to YYYY-MM-DD HH:MM format
  const formatSaleDate = (params: { saleDate?: string; saleTime?: string; showTime: boolean }): string => {
    // Check if saleDate is provided
    const { saleDate, showTime, saleTime } = params;

    if (!saleDate) return '';

    // Parse the date parts
    // Expected formats: "January 1, 2023" or "Jan. 1, 2023" or similar
    try {
      const dateObj = new Date(saleDate);
      if (isNaN(dateObj.getTime())) return saleDate; // Return original if parsing fails

      // Format the date part as YYYY-MM-DD
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');

      // Format the time part if available
      let formattedTime = '';
      if (showTime && saleTime) {
        // Extract hours and minutes from time string (expected format like "10:00 AM")
        const timeMatch = saleTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10);
          const minutes = timeMatch[2];
          const ampm = timeMatch[3]?.toUpperCase();

          // Convert to 24-hour format if AM/PM is specified
          if (ampm === 'PM' && hours < 12) hours += 12;
          if (ampm === 'AM' && hours === 12) hours = 0;

          formattedTime = ` ${String(hours).padStart(2, '0')}:${minutes}`;
        } else {
          formattedTime = ` ${saleTime}`;
        }
      }

      return `${year}-${month}-${day}${formattedTime}`;
    } catch (e) {
      console.error('Error formatting date:', e);
      return saleDate;
    }
  };

  // Sort function for table columns
  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';

    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    } else if (sortConfig.key === key && sortConfig.direction === 'descending') {
      // If already descending, clear the sort
      return setSortConfig({ key: null, direction: null });
    }

    setSortConfig({ key, direction });
  };

  // Get sorted postings
  const getSortedPostings = () => {
    if (!sortConfig.key || !sortConfig.direction) {
      return postings;
    }

    return [...postings].sort((a, b) => {
      let aValue: string | number = '';
      let bValue: string | number = '';

      // Extract values based on sort key
      if (sortConfig.key === 'status') {
        // Special handling for status with cancelled items
        if (a.status === 'loaded' && a.auctionNotice?.status?.toLowerCase().includes('cancel')) {
          aValue = 'cancelled';
        } else {
          aValue = a.status;
        }

        if (b.status === 'loaded' && b.auctionNotice?.status?.toLowerCase().includes('cancel')) {
          bValue = 'cancelled';
        } else {
          bValue = b.status;
        }
      } else if (sortConfig.key === 'city') {
        aValue = a.auctionNotice?.town || a.city || '';
        bValue = b.auctionNotice?.town || b.city || '';
      } else if (sortConfig.key === 'caseCaption') {
        aValue = a.auctionNotice?.caseCaption || '';
        bValue = b.auctionNotice?.caseCaption || '';
      } else if (sortConfig.key === 'saleDate') {
        // For sale date, we want to compare dates in our formatted style
        aValue = formatSaleDate({
          saleDate: a.auctionNotice?.saleDate,
          saleTime: a.auctionNotice?.saleTime,
          showTime: false,
        });
        bValue = formatSaleDate({
          saleDate: b.auctionNotice?.saleDate,
          saleTime: b.auctionNotice?.saleTime,
          showTime: false,
        });
      } else if (sortConfig.key === 'docketNumber') {
        aValue = a.auctionNotice?.docketNumber || '';
        bValue = b.auctionNotice?.docketNumber || '';
      } else if (sortConfig.key === 'address') {
        aValue = a.auctionNotice?.address || '';
        bValue = b.auctionNotice?.address || '';
      } else if (sortConfig.key === 'dollarAmountFound') {
        aValue = a.auctionNotice?.dollarAmountNumber || 0;
        bValue = b.auctionNotice?.dollarAmountNumber || 0;
      } else if (sortConfig.key === 'committeeName') {
        aValue = a.auctionNotice?.committeeName || '';
        bValue = b.auctionNotice?.committeeName || '';
      } else if (sortConfig.key === 'committeePhone') {
        aValue = findNumbersAndMakePhoneNumber(a.auctionNotice?.committeePhone || '');
        bValue = findNumbersAndMakePhoneNumber(b.auctionNotice?.committeePhone || '');
      } else if (sortConfig.key === 'committeeEmail') {
        aValue = (a.auctionNotice?.committeeEmail || '').toLowerCase();
        bValue = (b.auctionNotice?.committeeEmail || '').toLowerCase();
      } else if (sortConfig.key === 'distance') {
        const cityA = a.auctionNotice?.town || a.city || '';
        const cityB = b.auctionNotice?.town || b.city || '';
        const distanceA = getConnecticutDistance(cityA)?.miles ?? Number.POSITIVE_INFINITY;
        const distanceB = getConnecticutDistance(cityB)?.miles ?? Number.POSITIVE_INFINITY;
        aValue = distanceA;
        bValue = distanceB;
      }

      // Compare the values
      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  };

  // Get sort indicator for column headers
  const getSortIndicator = (key: string) => {
    if (sortConfig.key !== key) {
      return (
        <svg
          className="ml-2 inline-block h-3 w-3 opacity-0 group-hover:opacity-25"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
        </svg>
      );
    }

    return sortConfig.direction === 'ascending' ? (
      <svg
        className="ml-2 inline-block h-3.5 w-3.5 text-blue-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg
        className="ml-2 inline-block h-3.5 w-3.5 text-blue-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Calculate statistics
  const getStats = () => {
    const loaded = postings.filter((p) => p.status === 'loaded').length;
    const pending = postings.filter((p) => p.status === 'pending').length;
    const loading = postings.filter((p) => p.status === 'loading').length;
    const error = postings.filter((p) => p.status === 'error').length;
    const cancelled = postings.filter(
      (p) => p.status === 'loaded' && p.auctionNotice?.status?.toLowerCase().includes('cancel')
    ).length;

    return {
      loaded,
      pending,
      loading,
      error,
      cancelled,
      total: postings.length,
    };
  };

  // Function to download table data as CSV
  const downloadTableAsCSV = () => {
    // Filter for loaded postings only
    const loadedPostings = postings.filter((p) => p.status === 'loaded');

    if (loadedPostings.length === 0) {
      setError('No data available to download.');
      return;
    }

    // Sort postings by distance in ascending order
    const sortedPostings = [...loadedPostings].sort((a, b) => {
      const cityA = a.auctionNotice?.town || a.city || '';
      const cityB = b.auctionNotice?.town || b.city || '';
      const distanceA = getConnecticutDistance(cityA)?.miles ?? Number.POSITIVE_INFINITY;
      const distanceB = getConnecticutDistance(cityB)?.miles ?? Number.POSITIVE_INFINITY;
      return distanceA - distanceB;
    });

    // Define CSV headers
    const headers = [
      'Status',
      'City',
      'Approx. Distance from Bronxville (mi)',
      'Deposit',
      'Address',
      'Committee Name',
      'Committee Phone',
      'Committee Email',
      'Sale Date',
      'Docket Number',
    ];

    // Convert postings to CSV rows
    const rows = sortedPostings.map((posting) => {
      const status = posting.auctionNotice?.status?.toLowerCase().includes('cancel') ? 'Cancelled' : 'Active';

      const town = posting.auctionNotice?.town || posting.city || '';

      const distance = getConnecticutDistance(town)?.miles.toString() || 'N/A';

      const deposit = numberToDollarAmountString(posting.auctionNotice?.dollarAmountNumber || 0);

      const address = posting.auctionNotice?.address || '';

      const committeeName = posting.auctionNotice?.committeeName || '';

      const committeePhone = findNumbersAndMakePhoneNumber(posting.auctionNotice?.committeePhone || '');

      const committeeEmail = posting.auctionNotice?.committeeEmail || '';

      const saleDate = posting.auctionNotice?.saleDate
        ? formatSaleDate({
            saleDate: posting.auctionNotice.saleDate,
            saleTime: posting.auctionNotice.saleTime,
            showTime: true,
          })
        : '';

      const docketNumber = posting.auctionNotice?.docketNumber || '';

      // Escape fields that might contain commas
      const escapeCsvField = (field: string) => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      };

      return [
        escapeCsvField(status),
        escapeCsvField(town),
        escapeCsvField(distance),
        escapeCsvField(deposit),
        escapeCsvField(address),
        escapeCsvField(committeeName),
        escapeCsvField(committeePhone),
        escapeCsvField(committeeEmail),
        escapeCsvField(saleDate),
        escapeCsvField(docketNumber),
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows].join('\n');

    // Create file and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Format current date for filename
    const date = new Date();
    const formattedDate = date.toISOString().split('T')[0];

    const formattedTime = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const formattedDateTime = `${formattedDate}_${formattedTime}`;

    link.setAttribute('href', url);
    link.setAttribute('download', `foreclosure-data-${formattedDateTime}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Display status message
  const getStatusMessage = () => {
    if (fetchingCities) {
      return 'Fetching city list...';
    }

    if (fetchingPostings) {
      return `Fetching posting IDs for cities... (${progress.citiesProcessed}/${progress.totalCities})`;
    }

    if (fetchingDetails) {
      return `Fetching auction details... (${progress.completed}/${progress.total})`;
    }

    if (postings.length > 0) {
      const stats = getStats();
      return `Loaded ${stats.loaded} of ${stats.total} auction details (${stats.cancelled} cancelled)`;
    }

    return "Select cities and click 'Process Selected Cities' to fetch foreclosure data.";
  };

  // Generate email template from selected auction
  const generateEmailTemplate = () => {
    if (!selectedAuction) return '';

    const { address, committeeName } = selectedAuction;

    const emailText: string = `EMAIL ADDRESS: ${selectedAuction.committeeEmail}
    
Subject: Inquiry about property at ${address}


Hi ${capitalizeEachWord(committeeName)},

I hope your week is going well. I am reaching out regarding the property located at ${address}.

Is this auction still on? Would you please send me a note if it gets canceled?
What is the opening bid and the appraised value?
Is it vacant to your knowledge?
Is there anything else important you can share with us at this time?

Thank you.

Kind Regards,

Lela
`;

    return emailText;
  };

  // Copy the email template to clipboard
  const copyEmailToClipboard = () => {
    if (!selectedAuction) return;

    const emailText = generateEmailTemplate();
    navigator.clipboard
      .writeText(emailText)
      .then(() => {
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 3000); // Reset after 3 seconds
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
        setError('Failed to copy email text. Please try again.');
      });
  };

  return (
    <div className="h-auto bg-gray-900 p-4 text-gray-100">
      <div className="mb-4 p-4">
        <a href="https://niemo.io" className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-600">
          niemo.io
        </a>
      </div>
      <div className="w-full py-8">
        <header className="mb-6 text-center">
          <h1 className="mb-2 mb-8 text-3xl font-bold text-blue-300">Connecticut Foreclosure Data</h1>

          <a
            href="https://sso.eservices.jud.ct.gov/foreclosures/Public/PendPostbyTownList.aspx"
            className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-600"
          >
            sso.eservices.jud.ct.gov
          </a>
        </header>

        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-300">
                Data fetched at: <span className="font-semibold">{timestamp}</span>
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={fetchCityList}
                className="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-500"
                disabled={fetchingCities}
              >
                Refresh City List
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-900 p-4 text-red-200">
            <h3 className="mb-2 text-lg font-semibold">Error</h3>
            <p className="mb-3">{error}</p>

            {/* Show CORS extension help if error mentions CORS */}
            {error.toLowerCase().includes('cors') && (
              <div className="mt-4 rounded-lg border border-red-700 bg-red-950 p-4">
                <h4 className="mb-3 font-semibold text-red-100">How to Install the CORS Extension:</h4>

                <ol className="mb-4 space-y-2 text-sm">
                  <li className="flex items-start">
                    <span className="mr-2 font-bold">1.</span>
                    <span>
                      Click this link to open the Chrome Web Store:{' '}
                      <a
                        href="https://chromewebstore.google.com/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-300 underline hover:text-blue-200"
                      >
                        Allow CORS Extension
                      </a>
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 font-bold">2.</span>
                    <span>Click "Add to Chrome" to install the extension</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 font-bold">3.</span>
                    <span>After installation, click the extension icon in your browser toolbar and toggle it ON</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 font-bold">4.</span>
                    <span>Refresh this page and try again</span>
                  </li>
                </ol>

                <div className="space-y-3">
                  <div>
                    <p className="mb-2 text-xs font-semibold text-red-100">
                      Step 1: Find the extension in the Chrome Web Store
                    </p>
                    <img
                      src={`${process.env.PUBLIC_URL}/cors_extension_01.png`}
                      alt="CORS extension in Chrome Web Store"
                      className="rounded border border-red-700"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold text-red-100">
                      Step 2: Toggle the extension ON (you'll see it in your toolbar)
                    </p>
                    <img
                      src={`${process.env.PUBLIC_URL}/cors_extension_02.png`}
                      alt="CORS extension toggle in browser toolbar"
                      className="rounded border border-red-700"
                    />
                  </div>
                </div>

                <div className="mt-4 rounded bg-yellow-900/30 p-3 text-xs text-yellow-200">
                  <p className="font-semibold">Note:</p>
                  <p>
                    This extension is needed because the foreclosure website doesn't allow direct access from other
                    websites. The CORS extension temporarily removes this restriction for your browser only.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Distance Filter */}
        <div className="mb-6 rounded-lg bg-gray-800 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="font-medium text-gray-300">Approx. distance from Bronxville (mi):</label>
              <input
                aria-label="Approximate distance from Bronxville"
                type="number"
                min="0"
                max="100"
                value={distanceFromBronxville}
                onChange={(e) => setDistanceFromBronxville(Math.max(0, Number(e.target.value)))}
                className="w-20 rounded border border-gray-600 bg-gray-700 p-2 text-white"
              />
            </div>
            <div>
              <span className="text-sm text-gray-400">
                ({selectedCities.length} cities selected using straight-line town-center estimates)
              </span>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="mb-6 rounded-lg bg-gray-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-gray-300">{getStatusMessage()}</p>

            {(fetchingPostings || fetchingDetails) && (
              <div className="mt-2 w-full">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{
                      width: `${
                        fetchingPostings
                          ? (progress.citiesProcessed / progress.totalCities) * 100
                          : (progress.completed / progress.total) * 100
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats Dashboard (when data is loaded) */}
        {!fetchingCities && !fetchingPostings && !fetchingDetails && postings.length > 0 && (
          <div className="mb-6 rounded-lg bg-gray-800 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between">
              <h2 className="text-lg font-semibold text-blue-300">Foreclosure Data Summary</h2>

              <div className="group relative">
                <button
                  onClick={downloadTableAsCSV}
                  className="flex items-center rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-500"
                  disabled={fetchingDetails || postings.filter((p) => p.status === 'loaded').length === 0}
                  title="Download table data as CSV file"
                >
                  <svg
                    className="mr-2 h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    ></path>
                  </svg>
                  Download CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {(() => {
                const stats = getStats();
                return (
                  <>
                    <div className="rounded bg-gray-700 p-4">
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="text-xl font-bold text-white">{stats.total}</p>
                    </div>
                    <div className="rounded bg-gray-700 p-4">
                      <p className="text-xs text-gray-500">Loaded</p>
                      <p className="text-xl font-bold text-green-400">{stats.loaded}</p>
                    </div>
                    <div className="rounded bg-gray-700 p-4">
                      <p className="text-xs text-gray-500">Pending</p>
                      <p className="text-xl font-bold text-gray-400">{stats.pending}</p>
                    </div>
                    <div className="rounded bg-gray-700 p-4">
                      <p className="text-xs text-gray-500">Errors</p>
                      <p className="text-xl font-bold text-red-400">{stats.error}</p>
                    </div>
                    <div className="rounded bg-gray-700 p-4">
                      <p className="text-xs text-gray-500">Cancelled Sales</p>
                      <p className="text-xl font-bold text-yellow-400">{stats.cancelled}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* City Selection Section */}
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-blue-300">Connecticut Cities with Foreclosure Data</h2>
            <p className="text-sm text-gray-400">
              {cityList.length} cities found - select cities and click "Process" to fetch foreclosure data
            </p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={processSelectedCities}
              className="rounded bg-green-600 px-4 py-2 text-white transition hover:bg-green-500"
              disabled={fetchingCities || fetchingPostings || fetchingDetails || selectedCities.length === 0}
            >
              Process Selected Cities ({selectedCities.length})
            </button>
            <button
              onClick={selectAllCities}
              className="rounded bg-gray-700 px-4 py-2 text-white transition hover:bg-gray-600"
              disabled={fetchingCities || fetchingPostings || fetchingDetails || cityList.length === 0}
            >
              Select All Cities
            </button>
            <button
              onClick={clearCitySelection}
              className="rounded bg-gray-700 px-4 py-2 text-white transition hover:bg-gray-600"
              disabled={fetchingCities || fetchingPostings || fetchingDetails || selectedCities.length === 0}
            >
              Clear Selection
            </button>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-700">
            <div className="bg-gray-800 p-3">
              <h3 className="font-medium text-white">Select Cities</h3>
            </div>

            <div className="bg-gray-800 p-4">
              {fetchingCities ? (
                <div className="flex justify-center py-8">
                  <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-400"></div>
                </div>
              ) : cityList.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-5 lg:grid-cols-8">
                  {cityList.map((city, index) => (
                    <div
                      key={index}
                      onClick={() => handleCitySelection(city.name)}
                      className={`cursor-pointer rounded-lg p-3 transition ${
                        selectedCities.includes(city.name)
                          ? 'bg-blue-700 hover:bg-blue-600'
                          : (getConnecticutDistance(city.name)?.miles ?? Number.POSITIVE_INFINITY) <=
                              distanceFromBronxville
                            ? 'bg-emerald-900/40 hover:bg-emerald-800/40'
                            : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      <span
                        className={
                          selectedCities.includes(city.name)
                            ? 'text-blue-100'
                            : (getConnecticutDistance(city.name)?.miles ?? Number.POSITIVE_INFINITY) <=
                                distanceFromBronxville
                              ? 'text-emerald-300'
                              : 'text-gray-100'
                        }
                      >
                        {city.name} ({city.count})
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-400">
                  No cities found. The website structure may have changed or no data is available.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Loading Indicator - Full Screen for major operations */}
        {(fetchingPostings || fetchingDetails) && (
          <div className="my-8 flex flex-col items-center justify-center">
            <div className="mb-4 h-16 w-16 animate-spin rounded-full border-b-4 border-t-4 border-blue-400"></div>
            <p className="text-lg text-gray-300">
              {fetchingPostings ? 'Fetching posting IDs...' : 'Fetching auction details...'}
            </p>
          </div>
        )}

        {/* Results Table */}
        {!fetchingCities && !fetchingPostings && !fetchingDetails && postings.length > 0 && (
          <div className="mb-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-blue-300">Foreclosure Auction Notices</h2>
                <p className="text-sm text-gray-400">
                  {postings.filter((p) => p.status === 'loaded').length} of {postings.length} details loaded
                </p>
              </div>
              <a
                href="https://jud.ct.gov/WebForms/forms/Flat/CV077_FLAT.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-400 hover:text-blue-300"
                title="Blank Foreclosure Worksheet form (JD-CV-77) from CT Judicial Branch"
              >
                Blank Foreclosure Worksheet (JD-CV-77) ↗
              </a>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full divide-y divide-gray-700">
                <thead className="bg-gray-800">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
                    >
                      Photo
                    </th>
                    <th
                      scope="col"
                      onClick={() => requestSort('status')}
                      className={`cursor-pointer px-6 py-3 text-center text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'status'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center justify-center">
                        <span>Status</span>
                        {getSortIndicator('status')}
                      </div>
                    </th>
                    <th
                      scope="col"
                      onClick={() => requestSort('city')}
                      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'city'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center">
                        <span>City</span>
                        {getSortIndicator('city')}
                      </div>
                    </th>
                    <th
                      scope="col"
                      onClick={() => requestSort('distance')}
                      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'distance'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center">
                        <span>Approx. distance</span>
                        {getSortIndicator('distance')}
                      </div>
                    </th>
                    <th
                      scope="col"
                      onClick={() => requestSort('dollarAmountFound')}
                      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'city'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center">
                        <span>Deposit</span>
                        {getSortIndicator('dollarAmountFound')}
                      </div>
                    </th>

                    <th
                      scope="col"
                      onClick={() => requestSort('address')}
                      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'city'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center">
                        <span>Address</span>
                        {getSortIndicator('address')}
                      </div>
                    </th>

                    <th
                      scope="col"
                      onClick={() => requestSort('committeeName')}
                      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'city'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center">
                        <span>C. Name</span>
                        {getSortIndicator('companyName')}
                      </div>
                    </th>

                    <th
                      scope="col"
                      onClick={() => requestSort('committeePhone')}
                      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'city'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center">
                        <span>C. Phone</span>
                        {getSortIndicator('companyPhone')}
                      </div>
                    </th>

                    <th
                      scope="col"
                      onClick={() => requestSort('committeeEmail')}
                      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'city'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center">
                        <span>C. Email</span>
                        {getSortIndicator('companyEmail')}
                      </div>
                    </th>

                    <th
                      scope="col"
                      onClick={() => requestSort('saleDate')}
                      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'saleDate'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center">
                        <span>Sale</span>
                        {getSortIndicator('saleDate')}
                      </div>
                    </th>
                    <th
                      scope="col"
                      onClick={() => requestSort('docketNumber')}
                      className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider transition-colors duration-150 ${
                        sortConfig.key === 'docketNumber'
                          ? 'bg-blue-800/20 text-blue-200 hover:bg-blue-800/30'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="group flex items-center">
                        <span>Docket Number</span>
                        {getSortIndicator('docketNumber')}
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700 bg-gray-800">
                  {postings.length > 0 ? (
                    getSortedPostings().map((posting: PostingInfo, index: number) => {
                      const docket = posting.auctionNotice?.docketNumber || '';
                      const noticeUrl = `https://sso.eservices.jud.ct.gov/foreclosures/Public/PendPostDetailPublic.aspx?PostingId=${posting.postingId}`;
                      const noticeOpen = expandedNotices.has(posting.postingId);
                      return (
                        <React.Fragment key={`${posting.postingId}-${index}`}>
                          <tr className="hover:bg-gray-700">
                            {/* Photo — fixed box per row, image fits without cropping. */}
                            <td className="w-[160px] px-3 py-2 align-middle">
                              <div className="flex h-28 w-40 items-center justify-center overflow-hidden rounded bg-gray-700">
                                {posting.auctionNotice?.propertyImageUrl ? (
                                  <a
                                    href={posting.auctionNotice.propertyImageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open full-size photo"
                                    className="flex h-full w-full items-center justify-center"
                                  >
                                    <img
                                      src={posting.auctionNotice.propertyImageUrl}
                                      alt={posting.auctionNotice.address || 'Property'}
                                      loading="lazy"
                                      className="max-h-full max-w-full object-contain"
                                    />
                                  </a>
                                ) : (
                                  <span className="text-xs text-gray-500">—</span>
                                )}
                              </div>
                            </td>
                            {/* Status */}
                            <td className="whitespace-nowrap px-6 py-4 text-center text-sm text-gray-300">
                              {posting.status === 'loading' ? (
                                <span className="inline-flex items-center justify-center rounded-full border border-yellow-500 bg-yellow-900/30 px-2.5 py-0.5 text-center text-xs font-medium text-yellow-300 shadow-sm">
                                  <svg
                                    className="mr-1 h-3 w-3 animate-spin text-yellow-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                  Loading...
                                </span>
                              ) : posting.status === 'loaded' ? (
                                posting.auctionNotice?.status?.toLowerCase().includes('cancel') ? (
                                  <span className="inline-flex items-center justify-center rounded-full border border-orange-500 bg-orange-900/30 px-2.5 py-0.5 text-center text-xs font-medium text-orange-300 shadow-sm">
                                    <svg
                                      className="mr-1 h-3 w-3 text-orange-400"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    Cancelled
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center rounded-full border border-green-500 bg-green-900/30 px-2.5 py-0.5 text-center text-xs font-medium text-green-300 shadow-sm">
                                    <svg
                                      className="mr-1 h-3 w-3 text-green-400"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                    Active
                                  </span>
                                )
                              ) : posting.status === 'error' ? (
                                <span className="inline-flex items-center justify-center rounded-full border border-red-500 bg-red-900/30 px-2.5 py-0.5 text-center text-xs font-medium text-red-300 shadow-sm">
                                  <svg
                                    className="mr-1 h-3 w-3 text-red-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                  Error
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center rounded-full border border-blue-500 bg-blue-900/30 px-2.5 py-0.5 text-center text-xs font-medium text-blue-300 shadow-sm">
                                  <svg
                                    className="mr-1 h-3 w-3 text-blue-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                  </svg>
                                  Pending
                                </span>
                              )}
                            </td>

                            {/* City */}
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-white">
                              {posting.auctionNotice?.town || posting.city || 'N/A'}
                            </td>

                            {/* Distance */}
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                              {(() => {
                                const cityName = posting.auctionNotice?.town || posting.city || '';
                                const distance = getConnecticutDistance(cityName)?.miles;
                                return distance !== undefined ? `~${distance} mi` : 'N/A';
                              })()}
                            </td>

                            {/* Dollar Amount */}

                            <td className="px-6 py-4 text-sm text-gray-300">
                              {numberToDollarAmountString(posting.auctionNotice?.dollarAmountNumber || 0)}
                            </td>

                            {/* Address */}

                            <td className="px-6 py-4 text-sm text-gray-300">
                              {posting.auctionNotice?.address || 'N/A'}
                            </td>

                            {/* Committee Name */}
                            <td className="px-6 py-4 text-sm text-gray-300">
                              {capitalizeEachWord(posting.auctionNotice?.committeeName || 'N/A')}
                            </td>
                            {/* Committee Organization */}

                            {/* <td
                              className="px-6 py-4 text-sm text-gray-300"
                            >
                              {posting.auctionNotice?.committeeOrganization ||
                                'N/A'}
                            </td> */}
                            {/* Committee Phone */}

                            <td className="px-6 py-4 text-sm text-gray-300">
                              {findNumbersAndMakePhoneNumber(posting.auctionNotice?.committeePhone || '') || 'N/A'}
                            </td>
                            {/* Committee Email */}
                            <td className="px-6 py-4 text-sm lowercase text-gray-300">
                              <div className="flex items-center gap-2">
                                <span>{posting.auctionNotice?.committeeEmail || 'N/A'}</span>
                                {posting.auctionNotice?.committeeEmail && (
                                  <button
                                    onClick={() => {
                                      if (posting.auctionNotice) {
                                        // Open email compose modal with this auction's details
                                        setSelectedAuction(posting.auctionNotice);
                                        setIsEmailModalOpen(true);
                                      }
                                    }}
                                    className="rounded bg-blue-700 px-2 py-1 text-xs font-medium text-white transition hover:bg-blue-600"
                                    title="Compose email about this property"
                                  >
                                    Email
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Case Caption */}
                            {/* <td
                              className="px-6 py-4 text-sm text-gray-300"
                            >
                              {posting.auctionNotice?.caseCaption || 'N/A'}
                            </td> */}

                            {/* Sale Date */}
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                              {posting.auctionNotice?.saleDate
                                ? formatSaleDate({
                                    saleDate: posting.auctionNotice.saleDate,
                                    saleTime: posting.auctionNotice.saleTime,
                                    showTime: false,
                                  })
                                : 'N/A'}
                            </td>

                            {/* Docket Number */}
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{docket || 'N/A'}</td>

                            {/* Actions */}
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                              <button
                                type="button"
                                onClick={() => toggleInSet(setExpandedNotices, posting.postingId)}
                                className="text-lg font-medium text-blue-400 hover:text-blue-300"
                                aria-label={noticeOpen ? 'Hide notice' : 'Show notice'}
                                title={noticeOpen ? 'Hide notice' : 'Show notice'}
                              >
                                {noticeOpen ? '▲' : '▼'}
                              </button>
                            </td>
                          </tr>
                          {noticeOpen && (
                            <tr>
                              <td colSpan={12} className="bg-gray-900 p-0">
                                <div className="border-t border-gray-700 p-3">
                                  <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                                    <span>Notice — {posting.postingId}</span>
                                    <a
                                      href={noticeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:text-blue-300"
                                    >
                                      open in new tab ↗
                                    </a>
                                  </div>
                                  <iframe
                                    title={`Notice ${posting.postingId}`}
                                    src={noticeUrl}
                                    className="h-[600px] w-full rounded border border-gray-700 bg-white"
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={12} className="px-6 py-4 text-center text-gray-400">
                        No data available yet. Select cities and click "Process Selected Cities".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Email Compose Modal */}
        {isEmailModalOpen && selectedAuction && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black bg-opacity-50 p-4"
            onClick={() => {
              setIsEmailModalOpen(false);
              setEmailCopied(false);
            }}
          >
            <div
              className="relative mx-auto max-w-3xl rounded-lg bg-gray-800 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="rounded-t-lg border-b border-gray-700 bg-gray-900 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-white">
                    Email Template for {capitalizeEachWord(selectedAuction.address)}
                  </h3>
                  <button
                    onClick={() => {
                      setIsEmailModalOpen(false);
                      setEmailCopied(false);
                    }}
                    className="rounded-full bg-gray-800 p-1 text-gray-400 transition hover:bg-gray-700 hover:text-white"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-4">
                <div className="mb-4 flex justify-between rounded border border-gray-700 bg-gray-700 p-2">
                  <div>
                    <p className="text-xs text-gray-400">To: {selectedAuction.committeeEmail}</p>
                  </div>
                  <button
                    onClick={copyEmailToClipboard}
                    className={`flex items-center rounded px-3 py-1 text-xs font-medium ${
                      emailCopied ? 'bg-green-700 text-white' : 'bg-blue-700 text-white hover:bg-blue-600'
                    }`}
                  >
                    {emailCopied ? (
                      <>
                        <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        Copy Email
                      </>
                    )}
                  </button>
                </div>

                <div className="mt-4 max-h-96 overflow-y-auto rounded border border-gray-700 bg-gray-900 p-4 font-mono text-sm text-gray-300">
                  <pre className="whitespace-pre-wrap">{generateEmailTemplate()}</pre>
                </div>

                <div className="mt-4 text-sm text-gray-500">
                  <p>
                    Click the "Copy Email" button to copy this template to your clipboard. Then paste it into your email
                    client to send.
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="rounded-b-lg border-t border-gray-700 px-6 py-4">
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setIsEmailModalOpen(false);
                      setEmailCopied(false);
                    }}
                    className="rounded bg-gray-700 px-4 py-2 font-medium text-white hover:bg-gray-600"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Foreclosure;
