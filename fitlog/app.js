const STORAGE_KEY = "fitlog-local-v2";
const EXERCISE_CATALOG_VERSION = 2;

const categories = [
  "胸部",
  "背部",
  "腿部",
  "肩部",
  "手臂",
  "核心",
  "有氧",
  "拉伸",
];

const catalogAdditions = [
  ["蝴蝶机夹胸", "胸部"],
  ["哑铃飞鸟", "胸部"],
  ["俯身杠杆直臂下压", "背部"],
  ["器械辅助引体向上", "背部"],
  ["反向蝴蝶机飞鸟", "肩部"],
  ["哑铃锤式弯举", "手臂"],
  ["绳索直杆正握弯举", "手臂"],
  ["哑铃颈后臂屈伸", "手臂"],
];

const defaultExercises = [
  ["杠铃卧推", "胸部"],
  ["上斜哑铃卧推", "胸部"],
  ["俯卧撑", "胸部"],
  ["高位下拉", "背部"],
  ["坐姿划船", "背部"],
  ["硬拉", "背部"],
  ["深蹲", "腿部"],
  ["腿举", "腿部"],
  ["箭步蹲", "腿部"],
  ["推举", "肩部"],
  ["侧平举", "肩部"],
  ["面拉", "肩部"],
  ["二头弯举", "手臂"],
  ["绳索下压", "手臂"],
  ["平板支撑", "核心"],
  ["卷腹", "核心"],
  ["跑步", "有氧"],
  ["椭圆机", "有氧"],
  ["髋屈肌拉伸", "拉伸"],
  ...catalogAdditions,
].map(([name, category], index) => ({ id: `default-${index}`, name, category }));

const state = loadState();
let activeView = "today";
let activeLibraryCategory = "全部";
let deferredInstallPrompt = null;

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  initializeDates();
  renderAll();
  bindEvents();
  refreshIcons();
});

function bindElements() {
  [
    "todaySets",
    "todayLabel",
    "viewTitle",
    "recordForm",
    "recordDate",
    "categorySelect",
    "exerciseSelect",
    "setsInput",
    "repsInput",
    "weightInput",
    "durationInput",
    "noteInput",
    "quickAddBtn",
    "todayRecords",
    "clearTodayBtn",
    "exerciseForm",
    "newExerciseName",
    "newExerciseCategory",
    "libraryFilters",
    "exerciseList",
    "historySearch",
    "historyList",
    "statDays",
    "statSets",
    "statVolume",
    "statFavorite",
    "categoryStats",
    "installBtn",
    "exportBtn",
    "importInput",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  els.categorySelect.addEventListener("change", () => {
    renderExerciseSelect();
  });

  els.recordDate.addEventListener("change", () => {
    renderAll();
  });

  els.recordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addRecord();
  });

  els.quickAddBtn.addEventListener("click", () => {
    addRecord({ quick: true });
  });

  els.clearTodayBtn.addEventListener("click", () => {
    const date = els.recordDate.value;
    state.records = state.records.filter((record) => record.date !== date);
    saveState();
    renderAll();
  });

  els.exerciseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addExercise();
  });

  els.historySearch.addEventListener("input", renderHistory);
  els.installBtn.addEventListener("click", installApp);
  els.exportBtn.addEventListener("click", exportData);
  els.importInput.addEventListener("change", importData);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installBtn.hidden = false;
    refreshIcons();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    els.installBtn.hidden = true;
  });
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored && Array.isArray(stored.exercises) && Array.isArray(stored.records)) {
      migrateExerciseCatalog(stored);
      return stored;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    exercises: defaultExercises,
    records: [],
    exerciseCatalogVersion: EXERCISE_CATALOG_VERSION,
  };
}

function migrateExerciseCatalog(stored) {
  if ((stored.exerciseCatalogVersion || 1) >= EXERCISE_CATALOG_VERSION) return;

  const existing = new Set(stored.exercises.map((exercise) => `${exercise.name}::${exercise.category}`));
  const additions = catalogAdditions
    .map(([name, category]) => ({ id: createId(), name, category }))
    .filter((exercise) => !existing.has(`${exercise.name}::${exercise.category}`));
  stored.exercises.push(...additions);
  stored.exerciseCatalogVersion = EXERCISE_CATALOG_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function initializeDates() {
  const today = new Date();
  els.recordDate.value = formatDate(today);
  els.todayLabel.textContent = today.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function renderAll() {
  renderCategorySelects();
  renderExerciseSelect();
  renderTodayRecords();
  renderLibrary();
  renderHistory();
  renderStats();
  refreshIcons();
}

function renderCategorySelects() {
  const options = categories.map((category) => `<option value="${category}">${category}</option>`).join("");
  const currentCategory = els.categorySelect.value || categories[0];
  els.categorySelect.innerHTML = options;
  els.newExerciseCategory.innerHTML = options;
  els.categorySelect.value = currentCategory;
}

function renderExerciseSelect() {
  const selectedCategory = els.categorySelect.value || categories[0];
  const exercises = state.exercises.filter((exercise) => exercise.category === selectedCategory);
  els.exerciseSelect.innerHTML = exercises
    .map((exercise) => `<option value="${exercise.id}">${escapeHtml(exercise.name)}</option>`)
    .join("");
}

function renderTodayRecords() {
  const date = els.recordDate.value;
  const records = state.records.filter((record) => record.date === date);
  els.todaySets.textContent = String(totalSets(records));

  if (!records.length) {
    els.todayRecords.innerHTML = emptyHtml();
    return;
  }

  els.todayRecords.innerHTML = records
    .slice()
    .reverse()
    .map((record) => recordHtml(record))
    .join("");

  els.todayRecords.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord(button.dataset.deleteRecord));
  });
}

function renderLibrary() {
  const filters = ["全部", ...categories];
  els.libraryFilters.innerHTML = filters
    .map(
      (category) =>
        `<button class="pill ${category === activeLibraryCategory ? "active" : ""}" data-library-filter="${category}">${category}</button>`,
    )
    .join("");

  els.libraryFilters.querySelectorAll("[data-library-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeLibraryCategory = button.dataset.libraryFilter;
      renderLibrary();
      refreshIcons();
    });
  });

  const exercises =
    activeLibraryCategory === "全部"
      ? state.exercises
      : state.exercises.filter((exercise) => exercise.category === activeLibraryCategory);

  if (!exercises.length) {
    els.exerciseList.innerHTML = emptyHtml();
    return;
  }

  els.exerciseList.innerHTML = exercises
    .map(
      (exercise) => `
        <div class="exercise-item">
          <div>
            <div class="exercise-name">
              <strong>${escapeHtml(exercise.name)}</strong>
              <span class="tag">${exercise.category}</span>
            </div>
            <div class="exercise-meta">${exerciseRecordCount(exercise.name)} 次记录</div>
          </div>
          <button class="delete-button" data-delete-exercise="${exercise.id}" title="删除动作" aria-label="删除动作">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `,
    )
    .join("");

  els.exerciseList.querySelectorAll("[data-delete-exercise]").forEach((button) => {
    button.addEventListener("click", () => deleteExercise(button.dataset.deleteExercise));
  });
}

function renderHistory() {
  const keyword = els.historySearch.value.trim().toLowerCase();
  const records = keyword
    ? state.records.filter((record) =>
        `${record.exerciseName} ${record.category} ${record.note}`.toLowerCase().includes(keyword),
      )
    : state.records;

  if (!records.length) {
    els.historyList.innerHTML = emptyHtml();
    return;
  }

  const groups = records
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .reduce((acc, record) => {
      acc[record.date] ||= [];
      acc[record.date].push(record);
      return acc;
    }, {});

  els.historyList.innerHTML = Object.entries(groups)
    .map(
      ([date, dayRecords]) => `
        <article class="timeline-day">
          <h4>${formatDisplayDate(date)} · ${totalSets(dayRecords)} 组</h4>
          <div class="record-list">
            ${dayRecords.map((record) => recordHtml(record)).join("")}
          </div>
        </article>
      `,
    )
    .join("");

  els.historyList.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord(button.dataset.deleteRecord));
  });
}

function renderStats() {
  const days = new Set(state.records.map((record) => record.date));
  const totalSetCount = totalSets(state.records);
  const volume = state.records.reduce((sum, record) => sum + record.sets * record.reps * record.weight, 0);
  const favorite = favoriteExercise();

  els.statDays.textContent = String(days.size);
  els.statSets.textContent = String(totalSetCount);
  els.statVolume.textContent = String(Math.round(volume));
  els.statFavorite.textContent = favorite || "-";

  const counts = categories.map((category) => ({
    category,
    sets: totalSets(state.records.filter((record) => record.category === category)),
  }));
  const max = Math.max(1, ...counts.map((item) => item.sets));

  els.categoryStats.innerHTML = counts
    .filter((item) => item.sets > 0)
    .map(
      (item) => `
        <div class="bar-row">
          <div class="bar-info">
            <span>${item.category}</span>
            <span>${item.sets} 组</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${(item.sets / max) * 100}%"></div>
          </div>
        </div>
      `,
    )
    .join("");

  if (!els.categoryStats.innerHTML) {
    els.categoryStats.innerHTML = emptyHtml();
  }
}

function addRecord(options = {}) {
  const exercise = state.exercises.find((item) => item.id === els.exerciseSelect.value);
  if (!exercise) return;

  const record = {
    id: createId(),
    date: els.recordDate.value || formatDate(new Date()),
    category: exercise.category,
    exerciseName: exercise.name,
    sets: positiveNumber(els.setsInput.value, 1),
    reps: positiveNumber(els.repsInput.value, 1),
    weight: nonNegativeNumber(els.weightInput.value),
    duration: nonNegativeNumber(els.durationInput.value),
    note: els.noteInput.value.trim(),
    createdAt: new Date().toISOString(),
  };

  if (options.quick) {
    record.sets = 1;
  }

  state.records.push(record);
  saveState();
  renderAll();
}

function addExercise() {
  const name = els.newExerciseName.value.trim();
  const category = els.newExerciseCategory.value;
  if (!name) return;

  const exists = state.exercises.some(
    (exercise) => exercise.name === name && exercise.category === category,
  );
  if (exists) {
    els.newExerciseName.value = "";
    return;
  }

  const exercise = { id: createId(), name, category };
  state.exercises.push(exercise);
  els.newExerciseName.value = "";
  els.categorySelect.value = category;
  saveState();
  renderAll();
}

function deleteRecord(id) {
  state.records = state.records.filter((record) => record.id !== id);
  saveState();
  renderAll();
}

function deleteExercise(id) {
  const exercise = state.exercises.find((item) => item.id === id);
  if (!exercise) return;
  const used = state.records.some((record) => record.exerciseName === exercise.name);
  if (used) return;

  state.exercises = state.exercises.filter((item) => item.id !== id);
  saveState();
  renderAll();
}

function switchView(view) {
  activeView = view;
  const titles = {
    today: "快速记录",
    library: "动作库",
    history: "历史记录",
    stats: "训练统计",
  };

  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
  els.viewTitle.textContent = titles[view];
  refreshIcons();
}

function exportData() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fitlog-${formatDate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result));
      if (!Array.isArray(imported.exercises) || !Array.isArray(imported.records)) return;
      state.exercises = imported.exercises;
      state.records = imported.records;
      saveState();
      renderAll();
    } catch {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  els.installBtn.hidden = true;
}

function recordHtml(record) {
  const duration = record.duration ? ` · ${record.duration} 分钟` : "";
  const note = record.note ? ` · ${escapeHtml(record.note)}` : "";
  const weight = record.weight ? `${record.weight} kg` : "自重/无重量";

  return `
    <div class="record-item">
      <div>
        <div class="record-title">
          <strong>${escapeHtml(record.exerciseName)}</strong>
          <span class="tag">${record.category}</span>
        </div>
        <div class="record-meta">${record.sets} 组 × ${record.reps} 次 · ${weight}${duration}${note}</div>
      </div>
      <button class="delete-button" data-delete-record="${record.id}" title="删除记录" aria-label="删除记录">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `;
}

function emptyHtml() {
  return document.getElementById("emptyTemplate").innerHTML;
}

function favoriteExercise() {
  const counts = state.records.reduce((acc, record) => {
    acc[record.exerciseName] = (acc[record.exerciseName] || 0) + record.sets;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function exerciseRecordCount(name) {
  return state.records.filter((record) => record.exerciseName === name).length;
}

function totalSets(records) {
  return records.reduce((sum, record) => sum + record.sets, 0);
}

function positiveNumber(value, fallback) {
  return Math.max(1, Number.parseInt(value, 10) || fallback);
}

function nonNegativeNumber(value) {
  return Math.max(0, Number.parseFloat(value) || 0);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {});
  });
}
