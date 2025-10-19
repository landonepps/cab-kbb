const browserApi = globalThis.browser ?? globalThis.chrome;

const DEFAULT_ZIP = "90001";
const KBB_ORIGIN = "https://www.kbb.com";
const KBB_REFERER = `${KBB_ORIGIN}/`;
const KBB_API_URL_PATTERNS = [
  "https://www.kbb.com/api/*",
  "https://www.kbb.com/whats-my-car-worth/api/*"
];

async function readSettings() {
  const stored = await browserApi.storage.local.get({ zip: DEFAULT_ZIP });
  const zip = typeof stored.zip === "string" && /^\d{5}$/.test(stored.zip)
    ? stored.zip
    : DEFAULT_ZIP;
  return { zip };
}

function buildKbbHeaders(initHeaders) {
  const headers = new Headers(initHeaders ?? {});
  if (!headers.has("accept")) {
    headers.set("accept", "application/json, text/plain, */*");
  }
  if (!headers.has("referer")) {
    headers.set("referer", KBB_REFERER);
  }
  if (!headers.has("origin")) {
    headers.set("origin", KBB_ORIGIN);
  }
  return headers;
}

async function fetchJson(url, init) {
  const requestInit = {
    ...init,
    headers: buildKbbHeaders(init?.headers)
  };

  const response = await fetch(url, requestInit);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed with ${response.status}: ${body.substring(0, 200)}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn("Failed to parse JSON response", error, text);
    throw new Error("Unexpected response from Kelley Blue Book");
  }
}

async function fetchKbbSuggestion(query) {
  const url = new URL("https://www.kbb.com/api/vehicle/vehicle-suggestions");
  const attempts = [
    { vehicleCategory: "car" },
    { vehicleCategory: "usedcar" },
    { vehicleCategory: "newcar" },
    {}
  ];

  for (const params of attempts) {
    url.search = "";
    url.searchParams.set("term", query);
    url.searchParams.set("pageSize", "5");
    Object.entries(params).forEach(([key, value]) => {
      if (value != null) {
        url.searchParams.set(key, value);
      }
    });

    try {
      const suggestions = await fetchJson(url);
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        return suggestions[0];
      }
    } catch (error) {
      console.warn("KBB suggestion request failed", params, error);
    }
  }

  return null;
}

async function fetchKbbValuations({ vehicleId, styleId, zip }) {
  if (!vehicleId) {
    throw new Error("Missing vehicle identifier for KBB valuation");
  }

  const endpoint = new URL("https://www.kbb.com/api/vehicle/vehicle-valuation/standard");
  endpoint.searchParams.set("vehicleId", String(vehicleId));
  if (styleId) {
    endpoint.searchParams.set("vehicleStyleId", String(styleId));
  }
  endpoint.searchParams.set("zipCode", zip);

  const valuation = await fetchJson(endpoint);
  if (!valuation || typeof valuation !== "object") {
    throw new Error("KBB valuation response was empty");
  }
  return valuation;
}

function normaliseSuggestion(suggestion) {
  if (!suggestion || typeof suggestion !== "object") {
    return null;
  }
  const styles = Array.isArray(suggestion.styles) ? suggestion.styles : [];
  const primaryStyle = styles[0] ?? null;
  return {
    id: suggestion.id ?? suggestion.vehicleId ?? null,
    year: suggestion.year ?? suggestion.modelYear ?? null,
    make: suggestion.make ?? suggestion.makeName ?? null,
    model: suggestion.model ?? suggestion.modelName ?? null,
    trim: primaryStyle?.name ?? null,
    styleId: primaryStyle?.id ?? suggestion.styleId ?? suggestion.vehicleStyleId ?? null,
    raw: suggestion
  };
}

async function handleLookup(message) {
  const { year, make, model, trim } = message.payload ?? {};
  if (!year || !make || !model) {
    throw new Error("Missing vehicle information from Cars & Bids page");
  }

  const { zip } = await readSettings();
  const trimmedParts = [year, make, model, trim].filter(Boolean);
  const query = trimmedParts.join(" ");

  let suggestion = await fetchKbbSuggestion(query);
  if (!suggestion && trim) {
    suggestion = await fetchKbbSuggestion([year, make, model].join(" "));
  }

  if (!suggestion) {
    throw new Error("No matching vehicle found on KBB");
  }

  const normalised = normaliseSuggestion(suggestion);
  const valuation = await fetchKbbValuations({
    vehicleId: normalised?.id,
    styleId: normalised?.styleId,
    zip
  });

  return {
    ok: true,
    query,
    zip,
    suggestion: normalised,
    valuation
  };
}

browserApi.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  if (message.type === "lookupKbb") {
    return handleLookup(message).catch(error => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }));
  }

  return undefined;
});

function ensureKbbRequestHeaders(details) {
  const headers = details.requestHeaders ? [...details.requestHeaders] : [];

  const upsertHeader = (name, value) => {
    const existing = headers.find(header => header.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.value = value;
    } else {
      headers.push({ name, value });
    }
  };

  upsertHeader("Referer", KBB_REFERER);
  upsertHeader("Origin", KBB_ORIGIN);
  upsertHeader("Accept", "application/json, text/plain, */*");

  return { requestHeaders: headers };
}

if (browserApi?.webRequest?.onBeforeSendHeaders) {
  try {
    browserApi.webRequest.onBeforeSendHeaders.addListener(
      ensureKbbRequestHeaders,
      { urls: KBB_API_URL_PATTERNS },
      ["blocking", "requestHeaders", "extraHeaders"]
    );
  } catch (error) {
    console.warn("Failed to register KBB header shim", error);
  }
}
