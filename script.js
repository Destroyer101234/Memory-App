const STORAGE_PREFIX = "memory-companion";
const ACCOUNTS_KEY = `${STORAGE_PREFIX}-accounts`;
const SESSION_KEY = `${STORAGE_PREFIX}-active-user`;

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

const state = {
  user: null,
  authMode: "signin",
};

document.addEventListener("DOMContentLoaded", () => {
  const todayValue = today();
  selectors.date.value = todayValue;
  selectors.filterDate.value = todayValue;

  restoreSession();
  updateAuthUI();
  renderHistory();

  if (!state.user) {
    openAuthDialog();
  }
});

selectors.form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!state.user) {
    openAuthDialog();
    return;
  }

  const memory = getMemoryFromForm();
  if (!memory.title.trim()) {
    selectors.title.focus();
    return;
  }

  const events = loadEvents();
  events.push(memory);
  saveEvents(events);

  selectors.form.reset();
  selectors.date.value = memory.date;
  selectors.filterDate.value = memory.date;
  selectors.title.focus();

  renderHistory();
});

selectors.reset.addEventListener("click", () => {
  selectors.form.reset();
  selectors.date.value = today();
  selectors.title.focus();
});

selectors.filterDate.addEventListener("change", () => {
  if (!state.user) {
    openAuthDialog();
    return;
  }
  renderHistory();
});

selectors.searchText.addEventListener("input", () => {
  if (!state.user) {
    return;
  }
  renderHistory();
});

selectors.exportButton.addEventListener("click", () => {
  if (!state.user) {
    openAuthDialog();
    return;
  }

  const events = loadEvents();
  selectors.exportOutput.value = events.length
    ? JSON.stringify(events, null, 2)
    : "No memories saved yet.";
  selectors.exportDialog.showModal();
});

selectors.exportDialog.addEventListener("close", () => {
  selectors.exportOutput.value = "";
});

selectors.historyList.addEventListener("click", (event) => {
  const button = event.target.closest(".event-delete");
  if (!button || !state.user) {
    return;
  }

  const card = button.closest(".event-card");
  const id = card?.dataset.id;
  if (!id) {
    return;
  }

  const confirmed = window.confirm("Delete this memory? This cannot be undone.");
  if (!confirmed) {
    return;
  }

  deleteMemory(id);
  renderHistory();
});

selectors.authButton.addEventListener("click", () => {
  if (state.user) {
    signOut();
  } else {
    openAuthDialog();
  }
});

selectors.authModeToggle.addEventListener("click", () => {
  const nextMode = state.authMode === "signin" ? "create" : "signin";
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

selectors.authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleAuthSubmit();
});

async function handleAuthSubmit() {
  const name = selectors.authName.value.trim();
  const pin = selectors.authPin.value.trim();

  if (!name || !pin) {
    showAuthMessage("Please enter your name and passcode.");
    return;
  }

  if (state.authMode === "create") {
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
}

function getMemoryFromForm() {
  return {
    id: makeId("memory"),
    date: selectors.date.value || today(),
    time: selectors.time.value,
    title: selectors.title.value.trim(),
    details: selectors.details.value.trim(),
    createdAt: new Date().toISOString(),
  };
}

function loadEvents() {
  if (!state.user) {
    return [];
  }

  const storageKey = `${STORAGE_PREFIX}-events-${state.user.id}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Unable to load memories", error);
    return [];
  }
}

function saveEvents(events) {
  if (!state.user) {
    return;
  }

  const storageKey = `${STORAGE_PREFIX}-events-${state.user.id}`;
  localStorage.setItem(storageKey, JSON.stringify(events));
}

function deleteMemory(id) {
  const events = loadEvents();
  const next = events.filter((event) => event.id !== id);
  saveEvents(next);
}

function renderHistory() {
  selectors.historyList.innerHTML = "";

  if (!state.user) {
    selectors.historyList.appendChild(renderAuthPrompt());
    return;
  }

  const events = loadEvents();
  const activeDate = selectors.filterDate.value || today();
  const searchTerm = selectors.searchText.value.trim().toLowerCase();

  const filtered = events
    .filter((event) => {
      if (!searchTerm) {
        return true;
      }
      const text = `${event.title} ${event.details}`.toLowerCase();
      return text.includes(searchTerm);
    })
    .sort((a, b) => {
      if (a.date === b.date) {
        return compareTime(a.time, b.time);
      }
      return b.date.localeCompare(a.date);
    });

  const grouped = groupByDate(filtered);

  if (!grouped.length) {
    selectors.historyList.appendChild(renderEmptyState(Boolean(searchTerm)));
    return;
  }

  const todayValue = today();

  grouped.forEach(({ date, items }) => {
    const group = document.createElement("section");
    group.className = "day-group";
    if (date === activeDate) {
      group.classList.add("day-group--selected");
    }

    const header = document.createElement("header");
    header.className = "day-group__header";

    const title = document.createElement("div");
    title.className = "day-group__title";
    title.textContent = readableDate(date);

    if (date === todayValue) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Today";
      title.append(" ");
      title.appendChild(badge);
    } else if (date === activeDate) {
      const badge = document.createElement("span");
      badge.className = "badge badge--selected";
      badge.textContent = "Selected day";
      title.append(" ");
      title.appendChild(badge);
    }

    const count = document.createElement("span");
    count.className = "day-group__count";
    count.textContent = `${items.length} ${items.length === 1 ? "memory" : "memories"}`;

    header.appendChild(title);
    header.appendChild(count);
    group.appendChild(header);

    items
      .sort((first, second) => compareTime(first.time, second.time))
      .forEach((memory) => {
        const card = renderMemory(memory);
        group.appendChild(card);
      });

    selectors.historyList.appendChild(group);
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
    .map(([date, items]) => ({ date, items }));
}

function renderMemory(memory) {
  const fragment = selectors.template.content.cloneNode(true);
  const card = fragment.querySelector(".event-card");
  const title = fragment.querySelector(".event-title");
  const time = fragment.querySelector(".event-time");
  const details = fragment.querySelector(".event-details");

  card.dataset.id = memory.id;
  title.textContent = memory.title;
  time.textContent = memory.time ? formatTime(memory.time) : "Time unknown";
  details.textContent = memory.details || "";

  return fragment;
}

function renderEmptyState(hasSearch) {
  const container = document.createElement("div");
  container.className = "empty-state";
  container.innerHTML = hasSearch
    ? `<strong>No matches found.</strong> Try searching for another word or clearing the search box.`
    : `<strong>No memories yet.</strong> Add your first memory using the form on the left.`;
  return container;
}

function renderAuthPrompt() {
  const container = document.createElement("div");
  container.className = "empty-state";
  container.innerHTML = `<strong>Sign in to begin.</strong> Your memories stay private to your profile.`;
  return container;
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  const [hour, minute] = value.split(":").map(Number);
  if ([hour, minute].some((num) => Number.isNaN(num))) {
    return value;
  }

  const time = new Date();
  time.setHours(hour);
  time.setMinutes(minute);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
}

function compareTime(first, second) {
  if (!first && !second) {
    return 0;
  }
  if (!first) {
    return 1;
  }
  if (!second) {
    return -1;
  }
  return first.localeCompare(second);
}

function makeId(prefix = "memory") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readableDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const [year, month, day] = value.split("-").map(Number);
  if ([year, month, day].some((num) => Number.isNaN(num))) {
    return value;
  }

  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function setAuthMode(mode) {
  state.authMode = mode;
  const creating = mode === "create";
  selectors.authDialogTitle.textContent = creating ? "Create account" : "Sign in";
  selectors.authDialogDescription.textContent = creating
    ? "Create a profile so your memories stay private to you."
    : "Enter your name and passcode to continue.";
  selectors.authSubmit.textContent = creating ? "Create account" : "Sign in";
  selectors.authModeToggle.textContent = creating
    ? "Already have an account? Sign in"
    : "Need an account? Create one";
  selectors.authConfirmGroup.hidden = !creating;
  selectors.authConfirmPin.required = creating;
}

function openAuthDialog(mode = state.authMode) {
  setAuthMode(mode);
  showAuthMessage("");
  if (mode === "signin" && state.user) {
    selectors.authName.value = state.user.name;
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
  if (state.user) {
    selectors.authStatusName.textContent = `Signed in as ${state.user.name}`;
    selectors.authButton.textContent = "Sign out";
  } else {
    selectors.authStatusName.textContent = "Not signed in";
    selectors.authButton.textContent = "Sign in";
  }

  setAppEnabled(Boolean(state.user));
}

function setAppEnabled(enabled) {
  const fields = selectors.form.querySelectorAll("input, textarea, button");
  fields.forEach((field) => {
    field.disabled = !enabled;
  });

  selectors.filterDate.disabled = !enabled;
  selectors.searchText.disabled = !enabled;
  selectors.exportButton.disabled = !enabled;
}

function restoreSession() {
  const activeId = localStorage.getItem(SESSION_KEY);
  if (!activeId) {
    return;
  }

  const accounts = loadAccounts();
  const account = accounts.find((user) => user.id === activeId);
  if (account) {
    state.user = account;
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) {
      return [];
    }
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Unable to load accounts", error);
    return [];
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function createAccount(name, pin) {
  const accounts = loadAccounts();
  const exists = accounts.some((account) => account.name.toLowerCase() === name.toLowerCase());

  if (exists) {
    showAuthMessage("That name is already in use. Try another or sign in.");
    return;
  }

  const account = {
    id: makeId("user"),
    name,
    pinHash: await hashPasscode(pin),
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

  const hash = await hashPasscode(pin);
  if (hash !== account.pinHash) {
    showAuthMessage("Incorrect passcode. Please try again.");
    return;
  }

  activateUser(account);
  selectors.authDialog.close();
}

function activateUser(account) {
  state.user = account;
  localStorage.setItem(SESSION_KEY, account.id);
  selectors.form.reset();
  selectors.date.value = today();
  selectors.filterDate.value = today();
  selectors.searchText.value = "";
  updateAuthUI();
  renderHistory();
}

function signOut() {
  state.user = null;
  localStorage.removeItem(SESSION_KEY);
  selectors.form.reset();
  selectors.date.value = today();
  selectors.filterDate.value = today();
  selectors.searchText.value = "";
  updateAuthUI();
  renderHistory();
  openAuthDialog();
}

async function hashPasscode(value) {
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
