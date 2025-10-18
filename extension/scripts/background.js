const browserApi = globalThis.browser ?? globalThis.chrome;

const DEFAULT_ZIP = "90001";

async function readSettings() {
  const stored = await browserApi.storage.local.get({ zip: DEFAULT_ZIP });
  const zip = typeof stored.zip === "string" && /^\d{5}$/.test(stored.zip)
    ? stored.zip
    : DEFAULT_ZIP;
  return { zip };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
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
  url.searchParams.set("vehicleCategory", "car");
  url.searchParams.set("term", query);
  url.searchParams.set("pageSize", "5");
  const suggestions = await fetchJson(url);
  if (!Array.isArray(suggestions)) {
    return null;
  }
  return suggestions[0] ?? null;
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
