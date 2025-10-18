const browserApi = globalThis.browser ?? globalThis.chrome;

const bannerId = "cab-kbb-lookup";

function selectListingTitle() {
  const preferredSelectors = [
    'h1[data-testid="listing-title"]',
    'h1[class*="ListingPageHeader__Title"]',
    'h1[class*="ListingDetailsHeader"]',
    'h1[class*="Title"]',
    'header h1',
    'h1'
  ];

  for (const selector of preferredSelectors) {
    const node = document.querySelector(selector);
    if (node && node.textContent?.trim()) {
      return node;
    }
  }
  return null;
}

function parseVehicleInfo() {
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
  const pageTitle = ogTitle || document.title || "";

  const cleanedTitle = pageTitle.replace(/\s*[|\-].*$/u, "").trim();
  const words = cleanedTitle.split(/\s+/u).filter(Boolean);

  let year = null;
  let make = null;
  let model = null;
  const rest = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!year && /^\d{4}$/.test(word)) {
      year = word;
      continue;
    }
    if (year && !make) {
      make = word;
      continue;
    }
    if (year && make) {
      rest.push(word);
    }
  }

  if (!year || !make || rest.length === 0) {
    // fallback to slug
    const slugPart = window.location.pathname.split("/").filter(Boolean).pop();
    if (slugPart) {
      const slugWords = slugPart.split("-").filter(Boolean);
      const slugYear = slugWords.find(part => /^\d{4}$/.test(part));
      if (slugYear) {
        year = year ?? slugYear;
        const yearIndex = slugWords.indexOf(slugYear);
        const slugAfter = slugWords.slice(yearIndex + 1).map(capitalizeWord);
        const slugMake = slugAfter.shift();
        if (slugMake) {
          make = make ?? slugMake;
        }
        if (slugAfter.length) {
          rest.push(...slugAfter);
        }
      }
    }
  }

  model = rest.join(" ").trim();

  if (!year || !make || !model) {
    return null;
  }

  const trimMatch = model.match(/(.*?)(?:\s+(Limited|Premium|Touring|Sport|Base|L|S|SE|SEL|LT|LX|XLT|SR5|EX|EX-L|Platinum|Ultimate|Signature|Competition|GT|GT-R|RS|R|Type\s*R|Z06|ZL1|TRD\s*Pro|Black\s*Series))$/i);
  const trim = trimMatch ? trimMatch[2] : null;
  const coreModel = trimMatch ? trimMatch[1].trim() : model;

  return {
    year,
    make,
    model: coreModel,
    trim,
    title: `${year} ${make} ${coreModel}`.trim()
  };
}

function capitalizeWord(word) {
  if (!word) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function ensureBanner() {
  if (document.getElementById(bannerId)) {
    return document.getElementById(bannerId);
  }
  const titleNode = selectListingTitle();
  const target = titleNode?.parentElement ?? document.body;

  const container = document.createElement("section");
  container.id = bannerId;
  container.className = "cab-kbb-banner";

  const heading = document.createElement("h2");
  heading.textContent = "KBB Valuation";
  heading.className = "cab-kbb-banner__heading";

  const status = document.createElement("p");
  status.className = "cab-kbb-banner__status";
  status.textContent = "Ready to look up the Kelley Blue Book value.";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "cab-kbb-banner__button";
  button.textContent = "Check KBB Value";

  const details = document.createElement("div");
  details.className = "cab-kbb-banner__details";

  container.append(heading, status, button, details);

  if (titleNode) {
    titleNode.insertAdjacentElement("afterend", container);
  } else {
    target.prepend(container);
  }

  return container;
}

function renderValuation(detailsNode, valuation) {
  detailsNode.textContent = "";
  if (!valuation) {
    return;
  }

  const summary = valuation?.valuation?.summary ?? valuation?.summary ?? valuation;
  if (summary && typeof summary === "object") {
    const list = document.createElement("dl");
    list.className = "cab-kbb-banner__valuation";

    const entries = Object.entries(summary);
    entries
      .filter(([, value]) => value != null)
      .forEach(([key, value]) => {
        const dt = document.createElement("dt");
        dt.textContent = formatKey(key);
        const dd = document.createElement("dd");
        dd.textContent = formatValue(value);
        list.append(dt, dd);
      });

    if (list.childElementCount > 0) {
      detailsNode.appendChild(list);
      return;
    }
  }

  const fallback = document.createElement("p");
  fallback.textContent = "No structured valuation details were returned by Kelley Blue Book.";
  detailsNode.appendChild(fallback);
}

function formatKey(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, chr => chr.toUpperCase());
}

function formatValue(value) {
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "amount" in value) {
    return formatValue(value.amount);
  }
  return JSON.stringify(value);
}

function createKbbLink({ title, zip }) {
  const url = `https://www.kbb.com/whats-my-car-worth/?vehicle=${encodeURIComponent(title)}&zip=${encodeURIComponent(zip ?? "")}`;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.className = "cab-kbb-banner__link";
  anchor.textContent = "Open detailed report on KBB.com";
  return anchor;
}

async function handleLookup(container, vehicle) {
  const status = container.querySelector(".cab-kbb-banner__status");
  const button = container.querySelector(".cab-kbb-banner__button");
  const details = container.querySelector(".cab-kbb-banner__details");

  status.textContent = "Contacting Kelley Blue Book...";
  button.disabled = true;
  button.textContent = "Looking up...";

  try {
    const response = await browserApi.runtime.sendMessage({
      type: "lookupKbb",
      payload: vehicle
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Unable to fetch valuation");
    }

    status.textContent = `Based on ZIP ${response.zip}.`;
    renderValuation(details, response.valuation);
    details.appendChild(createKbbLink({ title: vehicle.title, zip: response.zip }));
    button.textContent = "Refresh KBB Value";
  } catch (error) {
    console.error("KBB lookup failed", error);
    status.textContent = error instanceof Error ? error.message : String(error);
    details.textContent = "";
    details.appendChild(createKbbLink({ title: vehicle.title }));
    button.textContent = "Try again";
  } finally {
    button.disabled = false;
  }
}

function bootstrap() {
  if (!/\/auctions\//.test(window.location.pathname)) {
    return;
  }

  const vehicle = parseVehicleInfo();
  if (!vehicle) {
    return;
  }

  const container = ensureBanner();
  const button = container.querySelector(".cab-kbb-banner__button");
  const status = container.querySelector(".cab-kbb-banner__status");

  status.textContent = `Detected ${vehicle.title}.`;
  button.addEventListener("click", () => handleLookup(container, vehicle), { once: false });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
