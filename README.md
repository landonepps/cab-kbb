# Cars & Bids KBB Lookup

This repository contains a Firefox extension that augments listings on [carsandbids.com](https://carsandbids.com) with a Kelley Blue Book (KBB) valuation lookup helper. The extension parses the active listing, detects the vehicle year/make/model, and lets you fetch KBB pricing data directly from the page.

## Features

- Detects the year, make, and model on Cars & Bids auction pages.
- Adds an inline widget that performs a Kelley Blue Book lookup with a single click.
- Displays the returned valuation data (when available) and links to the full report on KBB.com.
- Lets you configure the ZIP code used for valuations, ensuring geographically relevant pricing.

## Project structure

```
extension/
  manifest.json         # Firefox WebExtension manifest
  options.html          # Options page UI for configuring the default ZIP code
  scripts/
    background.js       # Handles KBB API requests and communicates with content scripts
    content-script.js   # Injects the widget into Cars & Bids listings
    options.js          # Saves/loads ZIP code preferences
  styles/
    content.css         # Styling for the injected widget
    options.css         # Styling for the options page
```

## Development

1. Clone the repository (or download the source archive).
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and choose the `extension/manifest.json` file from this project.
4. Visit any Cars & Bids listing. A “KBB Valuation” card should appear underneath the title. Click **Check KBB Value** to fetch the latest Kelley Blue Book data.
5. Configure your preferred ZIP code from the add-on’s options page (open via the extension’s menu or directly at `about:addons`).

> **Note:** The extension makes direct requests to public KBB endpoints and spoofs the required `Referer`/`Origin` headers so the requests resemble standard site traffic. If those endpoints change, introduce new anti-automation measures, or block your network the lookup may fail; a direct link to KBB.com is provided as a fallback.

### Troubleshooting

- **"NetworkError when attempting to fetch resource"** – Verify that your network can reach `www.kbb.com`. Some corporate or VPN networks block the domain, which prevents the extension from retrieving valuations. The widget will still expose a fallback link so you can open the valuation manually in a new tab.

## Packaging

To create a distributable bundle, zip the contents of the `extension/` directory:

```
cd extension
zip -r ../cars-and-bids-kbb.zip .
```

You can then submit `cars-and-bids-kbb.zip` to Firefox Add-on Developer Hub or side-load it locally.

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.
