# foreclosure

Standalone React app that browses pending Connecticut foreclosure auctions by
scraping `sso.eservices.jud.ct.gov` directly from the browser.

Extracted from the `/foreclosure` route of the `niemo_io` project.

## Deployment path

The app is built to be hosted under **`/foreclosure`**. This is controlled by
the `homepage` field in `package.json` — CRA rewrites asset URLs and
`process.env.PUBLIC_URL` accordingly.

## CORS requirement

The judicial site does not return CORS headers, so running this in a normal
browser will fail. Install a CORS-disabling extension (e.g.
[Allow CORS](https://chromewebstore.google.com/detail/allow-cors-access-control/lhobafahddgcelffkeicbaginigeejlf))
and toggle it on before using the page. The UI walks through this if the
initial fetch fails.

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
