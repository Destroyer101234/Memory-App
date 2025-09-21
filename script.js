const storageKeyBase = "memory-companion-events";
const accountsKey = "memory-companion-users";
const activeUserKey = "memory-companion-active-user";

const selectors = {
  form: document.querySelector("#event-form"),
  reset: document.querySelector("#reset-form"),
  date: document.querySelector("#event-date"),
  time: document.querySelector("#event-time"),
  title: document.querySelector("#event-title"),
  details: document.querySelector("#event-details"),
  historyList: document.querySelector("#history-list"),
  template: document.querySelector("#event-template"),
  filterDate: document.querySelector("#filter-date"),
  searchText: document.querySelector("#search-text"),
  exportButton: document.querySelector("#export-events"),
  exportDialog: document.querySelector("#export-dialog"),
  exportOutput: document.querySelector("#export-output"),
  authStatusName: document.querySelector("#auth-status-name"),
  authButton: document.querySelector("#auth-button"),
  authDialog: document.querySelector("#auth-dialog"),
  authForm: document.querySelector("#auth-form"),
  authDialogTitle: document.querySelector("#auth-dialog-title"),
  authDialogDescription: document.querySelector("#auth-dialog-description"),
  authSubmit: document.querySelector("#auth-submit"),
  authModeToggle: document.querySelector("#auth-mode-toggle"),
  authCancel: document.querySelector("#auth-cancel"),
  authConfirmGroup: document.querySelector("#auth-confirm-group"),
  authName: document.querySelector("#auth-name"),
  authPin: document.querySelector("#auth-pin"),
  authConfirmPin: document.querySelector("#auth-confirm-pin"),
  authMessage: document.querySelector("#auth-message"),
};

let currentUser = null;
let authMode = "signin";

document.addEventListener("DOMContentLoaded", () => {
  selectors.date.value = today();
  selectors.filterDate.value = today();
  restoreActiveUser();
  updateAuthUI();
  renderHistory();
  if (!currentUser) {
    openAuthDialog();
  }
});

selectors.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentUser) {
    openAuthDialog();
    return;
  }

  const memory = getFormData();

  if (!memory.title.trim()) {
    selectors.title.focus();
    return;
  }

  const events = loadEvents();
  events.push(memory);
  saveEvents(events);

  renderHistory(memory.date);
  selectors.form.reset();
  selectors.date.value = memory.date;
  selectors.filterDate.value = memory.date;
  selectors.title.focus();
});

selectors.reset.addEventListener("click", () => {
  selectors.form.reset();
  selectors.date.value = today();
  selectors.title.focus();
});

selectors.filterDate.addEventListener("change", () => {
  if (!currentUser) {
    openAuthDialog();
    return;
  }
  renderHistory(selectors.filterDate.value);
});

selectors.searchText.addEventListener("input", () => {
  if (!currentUser) {
    return;
  }
  renderHistory(selectors.filterDate.value);
});

selectors.exportButton.addEventListener("click", () => {
  if (!currentUser) {
    openAuthDialog();
    return;
  }

  const events = loadEvents();
  if (!events.length) {
    selectors.exportOutput.value = "No memories saved yet.";
  } else {
    selectors.exportOutput.value = JSON.stringify(events, null, 2);
  }
  selectors.exportDialog.showModal();
});

selectors.exportDialog.addEventListener("close", () => {
  selectors.exportOutput.value = "";
});

selectors.historyList.addEventListener("click", (event) => {
  const button = event.target.closest(".event-delete");
  if (!button || !currentUser) {
    return;
  }

  const card = button.closest(".event-card");
  const id = card?.getAttribute("data-id");
  if (!id) return;

  const confirmation = window.confirm("Delete this memory? This action cannot be undone.");
  if (!confirmation) return;

  deleteMemory(id);
  renderHistory(selectors.filterDate.value);
});

selectors.authButton.addEventListener("click", () => {
  if (currentUser) {
    signOut();
  } else {
    openAuthDialog();
  }
});

selectors.authModeToggle.addEventListener("click", () => {
  const nextMode = authMode === "signin" ? "create" : "signin";
  setAuthMode(nextMode);
  selectors.authForm.reset();
  showAuthMessage("");
  selectors.authName.focus();
});

selectors.authCancel.addEventListener("click", () => {
  selectors.authDialog.close();
});

selectors.authDialog.addEventListener("close", () => {
  selectors.authForm.reset();
  showAuthMessage("");
  setAuthMode("signin");
});

selectors.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = selectors.authName.value.trim();
  const pin = selectors.authPin.value.trim();

  if (!name || !pin) {
    showAuthMessage("Please enter your name and passcode.");
    return;
  }

  if (authMode === "create") {
    const confirmPin = selectors.authConfirmPin.value.trim();
    if (!confirmPin) {
      showAuthMessage("Please confirm your passcode.");
      return;
    }

    if (pin !== confirmPin) {
      showAuthMessage("Passcodes do not match. Try again.");
      return;
    }

    await createAccount(name, pin);
  } else {
    await signIn(name, pin);
  }
});

function getFormData() {
  const id = makeId("memory");
  return {
    id,
    date: selectors.date.value || today(),
    time: selectors.time.value,
    title: selectors.title.value.trim(),
    details: selectors.details.value.trim(),
    createdAt: new Date().toISOString(),
  };
}

function loadEvents() {
  if (!currentUser) return [];
  const storageKey = `${storageKeyBase}-${currentUser.id}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch (error) {
    console.error("Unable to load events", error);
    return [];
  }
}

function saveEvents(events) {
  if (!currentUser) return;
  const storageKey = `${storageKeyBase}-${currentUser.id}`;
  localStorage.setItem(storageKey, JSON.stringify(events));
}

function deleteMemory(id) {
  const events = loadEvents();
  const updated = events.filter((event) => event.id !== id);
  saveEvents(updated);
}

function renderHistory(activeDate = today()) {
  if (!currentUser) {
    selectors.historyList.innerHTML = "";
    selectors.historyList.appendChild(renderAuthPrompt());
    return;
  }

  const events = loadEvents();
  const searchTerm = selectors.searchText.value.trim().toLowerCase();
  const filtered = events
    .filter((event) => {
      if (searchTerm) {
        const text = `${event.title} ${event.details}`.toLowerCase();
        return text.includes(searchTerm);
      }
      return true;
    })
    .sort((a, b) => (a.date === b.date ? compareTime(a.time, b.time) : b.date.localeCompare(a.date)));

  const grouped = groupByDate(filtered);
  selectors.historyList.innerHTML = "";

  if (!grouped.length) {
    selectors.historyList.appendChild(renderEmptyState(Boolean(searchTerm)));
    return;
  }

  grouped.forEach(({ date, items }) => {
    const groupElement = document.createElement("section");
    groupElement.className = "day-group";

    const header = document.createElement("header");
    header.className = "day-group__header";

    const title = document.createElement("div");
    title.className = "day-group__title";
    title.textContent = readableDate(date);
    if (date === activeDate) {
      const badge = document.createElement("span");
      badge.textContent = "Today";
      badge.className = "badge";
      title.append(" ");
      title.appendChild(badge);
    }

    const count = document.createElement("span");
    count.className = "day-group__count";
    count.textContent = `${items.length} ${items.length === 1 ? "memory" : "memories"}`;

    header.appendChild(title);
    header.appendChild(count);

    groupElement.appendChild(header);

    items.forEach((memory) => {
      const node = renderEvent(memory);
      groupElement.appendChild(node);
    });

    selectors.historyList.appendChild(groupElement);
  });
}

function groupByDate(events) {
  const map = new Map();
  events.forEach((event) => {
    const list = map.get(event.date) || [];
    list.push(event);
    map.set(event.date, list);
  });

  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      items: items.sort((first, second) => compareTime(first.time, second.time)),
    }));
}

function renderEvent(memory) {
  const fragment = selectors.template.content.cloneNode(true);
  const card = fragment.querySelector(".event-card");
  const title = fragment.querySelector(".event-title");
  const time = fragment.querySelector(".event-time");
  const details = fragment.querySelector(".event-details");

  title.textContent = memory.title;
  time.textContent = memory.time ? formatTime(memory.time) : "Time unknown";
  details.textContent = memory.details || "";

  card.setAttribute("data-id", memory.id);

  return fragment;
}

function renderEmptyState(hasSearch) {
  const container = document.createElement("div");
  container.className = "empty-state";
  container.innerHTML = hasSearch
    ? `<strong>No matches found.</strong>Try searching with different words or clearing the search box.`
    : `<strong>No memories yet.</strong>Add your first memory using the form on the left.`;
  return container;
}

function renderAuthPrompt() {
  const container = document.createElement("div");
  container.className = "empty-state";
  container.innerHTML = `<strong>Sign in to begin.</strong>Your memories are kept safe under your own passcode.`;
  return container;
}

function formatTime(value) {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const date = new Date();
  date.setHours(hour);
  date.setMinutes(minute);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function compareTime(first, second) {
  if (!first && !second) return 0;
  if (!first) return 1;
  if (!second) return -1;
  return first.localeCompare(second);
}

function makeId(prefix = "memory") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readableDate(value) {
  if (!value) return "Unknown date";
  const [year, month, day] = value.split("-").map(Number);
  if ([year, month, day].some((num) => Number.isNaN(num))) return value;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function today() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function setAuthMode(mode) {
  authMode = mode;
  const isCreate = mode === "create";
  selectors.authDialogTitle.textContent = isCreate ? "Create account" : "Sign in";
  selectors.authDialogDescription.textContent = isCreate
    ? "Create a profile so your memories stay private to you."
    : "Enter your name and passcode to continue.";
  selectors.authSubmit.textContent = isCreate ? "Create account" : "Sign in";
  selectors.authModeToggle.textContent = isCreate
    ? "Already have an account? Sign in"
    : "Need an account? Create one";
  selectors.authConfirmGroup.hidden = !isCreate;
  selectors.authConfirmPin.required = isCreate;
}

function openAuthDialog(mode = authMode) {
  selectors.authForm.reset();
  showAuthMessage("");
  setAuthMode(mode);
  if (mode === "signin" && currentUser) {
    selectors.authName.value = currentUser.name;
  }
  if (!selectors.authDialog.open) {
    selectors.authDialog.showModal();
  }
  selectors.authName.focus();
}

function showAuthMessage(message) {
  selectors.authMessage.textContent = message;
  selectors.authMessage.hidden = !message;
}

function updateAuthUI() {
  if (currentUser) {
    selectors.authStatusName.textContent = `Signed in as ${currentUser.name}`;
    selectors.authButton.textContent = "Sign out";
  } else {
    selectors.authStatusName.textContent = "Not signed in";
    selectors.authButton.textContent = "Sign in";
  }
  setFormEnabled(Boolean(currentUser));
}

function setFormEnabled(enabled) {
  const elements = selectors.form.querySelectorAll("input, textarea, button");
  elements.forEach((element) => {
    element.disabled = !enabled;
  });
  selectors.filterDate.disabled = !enabled;
  selectors.searchText.disabled = !enabled;
  selectors.exportButton.disabled = !enabled;
}

function restoreActiveUser() {
  const activeId = localStorage.getItem(activeUserKey);
  if (!activeId) return;
  const accounts = loadAccounts();
  const account = accounts.find((user) => user.id === activeId);
  if (account) {
    currentUser = account;
  } else {
    localStorage.removeItem(activeUserKey);
  }
}

function loadAccounts() {
  try {
    const raw = localStorage.getItem(accountsKey);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch (error) {
    console.error("Unable to load accounts", error);
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
}

async function createAccount(name, pin) {
  const accounts = loadAccounts();
  const exists = accounts.some((account) => account.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    showAuthMessage("That name is already in use. Try a different one or sign in.");
    return;
  }

  const account = {
    id: makeId("user"),
    name,
    pinHash: await hashString(pin),
    createdAt: new Date().toISOString(),
  };

  accounts.push(account);
  saveAccounts(accounts);
  activateUser(account);
  selectors.authDialog.close();
}

async function signIn(name, pin) {
  const accounts = loadAccounts();
  const account = accounts.find((user) => user.name.toLowerCase() === name.toLowerCase());

  if (!account) {
    showAuthMessage("We couldn't find that name. Try again or create an account.");
    return;
  }

  const hash = await hashString(pin);
  if (hash !== account.pinHash) {
    showAuthMessage("Incorrect passcode. Please try again.");
    return;
  }

  activateUser(account);
  selectors.authDialog.close();
}

function activateUser(account) {
  currentUser = account;
  localStorage.setItem(activeUserKey, account.id);
  updateAuthUI();
  selectors.form.reset();
  selectors.date.value = today();
  selectors.filterDate.value = today();
  selectors.searchText.value = "";
  renderHistory();
}

function signOut() {
  currentUser = null;
  localStorage.removeItem(activeUserKey);
  selectors.form.reset();
  selectors.date.value = today();
  selectors.filterDate.value = today();
  selectors.searchText.value = "";
  updateAuthUI();
  renderHistory();
  openAuthDialog();
}

async function hashString(value) {
  if (typeof crypto !== "undefined" && crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return value;
}
