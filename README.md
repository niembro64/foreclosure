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

The New Jersey workflow first uses the narrowly scoped same-origin bridge at
`/api/civilview`. `npm start` automatically installs the local bridge through
`src/setupProxy.js`; restart the dev server after pulling changes so CRA loads
it. The Cloudflare Pages deployment equivalent lives in
`functions/api/civilview.ts`. Both proxy only the four configured county IDs and
numeric property IDs while maintaining CivilView's county-specific ASP.NET
sessions. Turn the CORS extension **off** for New Jersey because it can rewrite
the same-origin bridge response. CivilView detail enrichment requires the
bridge; the direct Details action is available as a manual fallback.

## Distance estimates

Both state screens default to properties within approximately 25 straight-line
miles of Bronxville, NY. Connecticut uses town internal points. New Jersey uses
the property's ZIP Code Tabulation Area internal point when the listing contains
a ZIP code and falls back to the county internal point. The built-in reference
values were calculated from the U.S. Census Bureau's 2025 Gazetteer files, so
they are useful proximity estimates rather than driving distances or parcel-level
geocodes.

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
