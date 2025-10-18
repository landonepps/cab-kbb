const browserApi = globalThis.browser ?? globalThis.chrome;
const DEFAULT_ZIP = "90001";

function showStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.value = message;
  status.classList.toggle("options__status--error", isError);
}

async function loadSettings() {
  const { zip = DEFAULT_ZIP } = await browserApi.storage.local.get({ zip: DEFAULT_ZIP });
  const input = document.getElementById("zip");
  input.value = zip;
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) {
    return;
  }
  const formData = new FormData(form);
  const zip = (formData.get("zip") ?? "").toString();

  if (!/^\d{5}$/.test(zip)) {
    showStatus("ZIP codes must be exactly five digits.", true);
    return;
  }

  await browserApi.storage.local.set({ zip });
  showStatus("Saved.");
}

document.getElementById("settings-form").addEventListener("submit", saveSettings);

loadSettings().catch(error => {
  console.error("Failed to load settings", error);
  showStatus("Unable to read stored preferences.", true);
});
