const storageKey = "memory-companion-events";

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
};

document.addEventListener("DOMContentLoaded", () => {
  selectors.date.value = today();
  selectors.filterDate.value = today();
  renderHistory();
});

selectors.form.addEventListener("submit", (event) => {
  event.preventDefault();
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
  renderHistory(selectors.filterDate.value);
});

selectors.searchText.addEventListener("input", () => {
  renderHistory(selectors.filterDate.value);
});

selectors.exportButton.addEventListener("click", () => {
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

function getFormData() {
  const id = makeId();
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
  localStorage.setItem(storageKey, JSON.stringify(events));
}

function renderHistory(activeDate = today()) {
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

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `memory-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
