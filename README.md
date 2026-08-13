# foreclosure

Standalone React app that browses Connecticut and New Jersey foreclosure auctions.

- Connecticut data comes from `sso.eservices.jud.ct.gov`.
- New Jersey data comes from CivilView for Essex, Passaic, Hudson, and Union counties.
- CivilView listing rows are enriched from detail pages with upset prices, status
  history, case numbers, attorneys, parcel information, and sale-notice details.
- New Jersey records can be filtered and exported to CSV and include manual
  research links for Zillow, Realtor.com, Redfin, Homes.com, and Google Maps.

Extracted from the `/foreclosure` route of the `niemo_io` project.

## Deployment path

The app is deployed at **`https://games.niemo.io/foreclosure/`** and built under
**`/foreclosure`**. This is controlled by
the `homepage` field in `package.json` — CRA rewrites asset URLs and
`process.env.PUBLIC_URL` accordingly.

## CORS requirement

The Connecticut source does not return usable CORS headers, so install a
CORS-disabling extension (e.g.
[Allow CORS](https://chromewebstore.google.com/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf))
and toggle it on before using Connecticut data.

The New Jersey workflow first uses the narrowly scoped Cloudflare Pages Function
at `/api/civilview`. It proxies only the four configured county IDs and numeric
property IDs and maintains CivilView's county-specific ASP.NET sessions with
HTTP-only cookies. On static hosts without function support, New Jersey falls
back to direct browser requests using the CORS extension. When a detail request
is blocked, the app retains the county listing and provides a session-aware
direct-detail action.

## Data-source boundaries

Gross Polowy and Friedman Vartolo require acceptance of terms that restrict
copying or downloading their listings, and LOGS currently publishes its report
through an embedded Power BI report. These are linked as manual research sources
rather than scraped. Automated valuation capture should use licensed APIs or a
permitted property-data provider; the app currently supplies targeted research
links without copying third-party valuation content.

## Scripts

```
npm start       # dev server — opens at http://localhost:3000/foreclosure
npm run build   # production build in ./build (hosted at /foreclosure/)
npm test        # run tests
npm run typecheck
npm run format  # prettier
```

## Stack

Create React App 5, React 18, TypeScript, Tailwind 3, SCSS, axios.
