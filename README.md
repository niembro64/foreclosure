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
`/api/civilview`. That bridge is **not part of this repo** — it lives in
[web_games_backend](https://github.com/niembro64/web_games_backend), the single
backend behind games.niemo.io. In production nginx routes `/api/` to it; in
development `src/setupProxy.js` forwards the same paths to a local checkout of
it (see Production server below). The Cloudflare Pages deployment equivalent
lives in `functions/api/civilview.ts`. All implementations proxy only the four
configured county IDs and numeric property IDs while maintaining CivilView's
county-specific ASP.NET sessions. CivilView detail enrichment requires the
bridge; the direct Details action is available as a manual fallback.

## Production server

This repo builds to static files only. Uploading `build/` to a static web root
covers Connecticut, but **not** New Jersey: the compiled files are browser code,
while CivilView detail pages require a server-side ASP.NET session.

That server-side half is
[web_games_backend](https://github.com/niembro64/web_games_backend). Deploy it
once for the whole domain — it also carries the lobby directory for the games on
games.niemo.io — and this app needs nothing but its static build:

```sh
npm ci
npm run build          # compile into ./build
# then publish ./build to /var/www/games.niemo.io/foreclosure/
```

For local development, run the backend next to the dev server:

```sh
cd ../web_games_backend && npm start   # 127.0.0.1:3001
cd ../foreclosure && npm start         # forwards /api/ to it
```

Set `WEB_GAMES_BACKEND_ORIGIN` to point the dev proxy somewhere else. Verify a
deployment before opening the NJ screen:

```sh
curl -i https://games.niemo.io/api/health
curl -I 'https://games.niemo.io/api/civilview?countyId=10'
```

Both responses must be HTTP 200 and include `X-CivilView-Proxy: 1`.

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
                # forwards /api/ to web_games_backend on 127.0.0.1:3001
npm run build   # compile the production app into ./build
npm test        # run tests
npm run typecheck
npm run format  # prettier
```

## Stack

Create React App 5, React 18, TypeScript, Tailwind 3, SCSS, axios.
