"use strict";

/* =========================================================
   FOCUSFLOW — SHARED HELPERS AND STORAGE
========================================================= */

const DEFAULT_SETTINGS = {
  name: "Student",
  dailyGoal: 120,
  focus: 25,
  short: 5,
  long: 15,
  theme: "light"
};

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem("ff_" + key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem("ff_" + key, JSON.stringify(value));
}

function uid() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2, 9);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function field(id) {
  return document.getElementById(id);
}

function localDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function parseDate(value) {
  return new Date(value + "T12:00:00");
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;

  const date = parseDate(value);

  return !Number.isNaN(date.getTime()) &&
    localDate(date) === value;
}

function addDays(value, count) {
  const date = typeof value === "string"
    ? parseDate(value)
    : new Date(value);

  date.setDate(date.getDate() + count);
  return localDate(date);
}

function weekStart(value = localDate()) {
  const date = parseDate(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDate(date);
}

function dateLabel(value) {
  if (!validDate(value)) return "No date";

  return parseDate(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function minutesLabel(value) {
  const minutes = Math.round(Number(value) || 0);

  return minutes < 60
    ? minutes + "m"
    : Math.floor(minutes / 60) + "h " + (minutes % 60) + "m";
}

function numberIn(value, minimum, maximum, fallback) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : fallback;
}

const state = {
  tasks: load("tasks", []),
  events: load("events", []),
  sessions: load("sessions", []),
  settings: {
    ...DEFAULT_SETTINGS,
    ...load("settings", {})
  },

  // Conversation is never restored from storage.
  chat: []
};

for (const key of ["tasks", "events", "sessions"]) {
  if (!Array.isArray(state[key])) state[key] = [];
}

// Remove chatbot data saved by earlier versions.
for (const key of [
  "ff_chat",
  "ff_companionDraft",
  "ff_companionLastPrompt"
]) {
  localStorage.removeItem(key);
}

function persist() {
  // Chat messages and unsaved roadmaps are deliberately excluded.
  for (const key of ["tasks", "events", "sessions", "settings"]) {
    save(key, state[key]);
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

const PAGES = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "M3 11l9-8 9 8M5 10v11h14V10M9 21v-7h6v7"
  },
  {
    id: "tasks",
    label: "My Tasks",
    icon: "M9 6h12M9 12h12M9 18h12M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: "M4 5h16v16H4zM8 2v6M16 2v6M4 10h16"
  },
  {
    id: "timer",
    label: "Focus Timer",
    icon: "M9 2h6M12 2v3M12 9v5l3 2M21 14a9 9 0 1 1-18 0 9 9 0 0 1 18 0"
  },
  {
    id: "companion",
    label: "Study Companion",
    icon: "M4 4h16v13H9l-5 4zM8 9h8M8 13h5"
  },
  {
    id: "progress",
    label: "Progress",
    icon: "M4 20V11M10 20V5M16 20v-7M22 20H2"
  },
  {
    id: "settings",
    label: "Settings",
    icon: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"
  }
];

function route() {
  const value = location.hash.replace("#", "");

  return PAGES.some(page => page.id === value)
    ? value
    : "dashboard";
}

function renderNavigation() {
  const links = PAGES.map(page => `
    <a href="#${page.id}"
       class="${route() === page.id ? "active" : ""}"
       ${route() === page.id ? 'aria-current="page"' : ""}>
      <svg width="20" height="20" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true">
        <path d="${page.icon}"></path>
      </svg>
      ${page.label}
    </a>
  `).join("");

  field("nav").innerHTML = links;
  field("mobilebar").innerHTML = links;
}

function render() {
  renderNavigation();

  const pages = {
    dashboard: pageDashboard,
    tasks: pageTasks,
    calendar: pageCalendar,
    timer: pageTimer,
    companion: pageCompanion,
    progress: pageProgress,
    settings: pageSettings
  };

  pages[route()](field("app"));
}

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});

/* =========================================================
   SHARED MODAL
========================================================= */

function modal(content) {
  field("modalBody").innerHTML = content;
  field("modal").classList.add("open");

  setTimeout(() => {
    field("modalBody")
      .querySelector("input, textarea, select, button")
      ?.focus();
  }, 0);
}

function closeModal() {
  field("modal").classList.remove("open");
}

field("modal").addEventListener("click", event => {
  if (event.target.id === "modal") closeModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
});

/* =========================================================
   SHARED TASKS AND ANALYTICS
========================================================= */

function taskRow(task, editable = false) {
  return `
    <div class="task ${task.done ? "done" : ""}">
      <input type="checkbox"
             aria-label="Complete ${esc(task.title)}"
             ${task.done ? "checked" : ""}
             onchange="toggleTask('${task.id}')">

      <div style="flex:1">
        <div class="title">${esc(task.title)}</div>
        <div class="meta">
          ${esc(task.subject || "General")} ·
          ${dateLabel(task.due)} ·
          ${minutesLabel(task.duration)}
        </div>
      </div>

      <span class="pill">${esc(task.priority || "Medium")}</span>

      ${editable ? `
        <button class="btn ghost small"
                onclick="taskForm('${task.id}')">Edit</button>
      ` : ""}
    </div>
  `;
}

function toggleTask(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return;

  task.done = !task.done;
  task.completedAt = task.done ? new Date().toISOString() : null;
  task.completedDate = task.done ? localDate() : null;

  persist();
  render();
}

function focusMinutes(sessions) {
  return sessions.reduce(
    (total, session) => total + (Number(session.minutes) || 0),
    0
  );
}

function studyDates() {
  return new Set(
    state.sessions
      .filter(session => Number(session.minutes) > 0)
      .map(session => session.date)
  );
}

function currentStreak() {
  const dates = studyDates();
  let day = localDate();

  if (!dates.has(day)) day = addDays(day, -1);

  let count = 0;

  while (dates.has(day)) {
    count++;
    day = addDays(day, -1);
  }

  return count;
}

function weeklyFocusChart() {
  const start = weekStart();

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);

    return {
      label: parseDate(date).toLocaleDateString(undefined, {
        weekday: "short"
      }),
      minutes: focusMinutes(
        state.sessions.filter(session => session.date === date)
      )
    };
  });

  const maximum = Math.max(30, ...days.map(day => day.minutes));

  return `
    <div style="display:flex;gap:10px;align-items:flex-end;height:190px"
         role="img" aria-label="Focus minutes for each day this week">
      ${days.map(day => `
        <div style="flex:1;min-width:0;text-align:center">
          <small style="color:var(--muted);font-size:10px">
            ${Math.round(day.minutes)}m
          </small>

          <div style="
            height:${Math.max(3, day.minutes / maximum * 125)}px;
            width:65%;
            margin:5px auto;
            background:var(--accent);
          "></div>

          <small>${day.label}</small>
        </div>
      `).join("")}
    </div>
  `;
}

/* =========================================================
   1. DASHBOARD
========================================================= */

function pageDashboard(element) {
  const today = localDate();
  const pending = state.tasks.filter(task => !task.done);
  const completed = state.tasks.filter(task => task.done);
  const todayTasks = pending.filter(task => task.due === today).slice(0, 5);

  const overdue = pending.filter(
    task => task.due && task.due < today
  ).length;

  const todayFocus = focusMinutes(
    state.sessions.filter(session => session.date === today)
  );

  const hour = new Date().getHours();
  const greeting = hour < 12
    ? "Good morning"
    : hour < 18
    ? "Good afternoon"
    : "Good evening";

  element.innerHTML = `
    <h1>${greeting}, ${esc(state.settings.name)}</h1>
    <p class="sub">
      A little focus. A little growth. Take one manageable step today.
    </p>

    <section class="card" style="margin-bottom:22px">
      <div class="row">
        <div>
          <h2>Your productive space</h2>
          <p class="sub" style="margin:0">
            Settle in and give one task your attention.
          </p>
        </div>

        <button class="btn" onclick="quickStartFocus()">
          Start ${state.settings.focus}-minute focus
        </button>
      </div>
    </section>

    <div class="stats">
      <div class="stat">
        <small>Pending tasks</small><b>${pending.length}</b>
      </div>
      <div class="stat">
        <small>Completed tasks</small><b>${completed.length}</b>
      </div>
      <div class="stat">
        <small>Focus today</small><b>${minutesLabel(todayFocus)}</b>
      </div>
      <div class="stat">
        <small>Study streak</small><b>${currentStreak()} days</b>
      </div>
    </div>

    <div class="grid g2">
      <section class="card">
        <h2>Today's tasks</h2>

        ${overdue ? `
          <p class="sub">
            ${overdue} earlier task(s) are pending.
            Adjust them in My Tasks when you are ready.
          </p>
        ` : ""}

        ${todayTasks.length
          ? todayTasks.map(task => taskRow(task)).join("")
          : `<div class="empty">
               Nothing due today. Plan a small step or start a session.
             </div>`
        }

        <a class="btn ghost small" href="#tasks">Open My Tasks</a>
      </section>

      <section class="card">
        <h2>This week's focus</h2>
        ${weeklyFocusChart()}
      </section>
    </div>

    <div class="links">
      <a href="#tasks">My Tasks<small>Daily and weekly planning</small></a>
      <a href="#calendar">Calendar<small>Events and deadlines</small></a>
      <a href="#progress">Progress<small>Your effort and consistency</small></a>
      <a href="#companion">Study Companion<small>Build a roadmap</small></a>
    </div>
  `;
}

/* =========================================================
   2. MY TASKS
========================================================= */

let taskView = "daily";
let taskDate = localDate();
let weekOffset = 0;

function pageTasks(element) {
  const start = addDays(weekStart(), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  const listFor = date => state.tasks
    .filter(task => task.due === date)
    .sort((a, b) => Number(a.done) - Number(b.done));

  const datesToCheck = taskView === "daily" ? [taskDate] : days;

  const overloadedDays = datesToCheck.filter(date => {
    const minutes = listFor(date)
      .filter(task => !task.done)
      .reduce((total, task) => total + Number(task.duration || 0), 0);

    return state.settings.dailyGoal > 0 &&
      minutes > state.settings.dailyGoal;
  });

  element.innerHTML = `
    <h1>My Tasks</h1>
    <p class="sub">Make room for steady, manageable progress.</p>

    <div class="tabs">
      <button class="tab ${taskView === "daily" ? "active" : ""}"
              onclick="setTaskView('daily')">Daily Tasks</button>
      <button class="tab ${taskView === "weekly" ? "active" : ""}"
              onclick="setTaskView('weekly')">Weekly Planner</button>
    </div>

    <button class="btn" onclick="taskForm()">+ Add task</button>
    <div style="height:18px"></div>

    ${overloadedDays.length ? `
      <div class="warn">
        Your plan exceeds your daily study goal of
        ${minutesLabel(state.settings.dailyGoal)}
        on ${overloadedDays.length} day(s).
        Consider moving or shortening a few tasks.
      </div>
    ` : ""}

    ${taskView === "daily" ? `
      <label for="taskDay">Choose a day</label>
      <input id="taskDay" type="date" value="${taskDate}"
             onchange="taskDate=this.value;render()"
             style="max-width:260px;margin-bottom:18px">

      <section class="card">
        ${listFor(taskDate).length
          ? listFor(taskDate).map(task => taskRow(task, true)).join("")
          : '<div class="empty">No tasks for this day yet.</div>'
        }
      </section>
    ` : `
      <div class="row" style="margin-bottom:18px">
        <button class="btn ghost"
                onclick="weekOffset--;render()">Previous week</button>

        <span style="align-self:center;text-align:center">
          ${dateLabel(start)} – ${dateLabel(days[6])}
        </span>

        <button class="btn ghost"
                onclick="weekOffset++;render()">Next week</button>
      </div>

      <div class="grid g3">
        ${days.map(date => `
          <section class="card">
            <h2>${parseDate(date).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric"
            })}</h2>

            ${listFor(date).length
              ? listFor(date).map(task => taskRow(task, true)).join("")
              : '<div class="empty">Room to breathe.</div>'
            }
          </section>
        `).join("")}
      </div>
    `}
  `;
}

function setTaskView(view) {
  taskView = view;
  render();
}

function taskForm(id = "") {
  const task = state.tasks.find(item => item.id === id) || {
    title: "",
    subject: "",
    due: taskDate,
    priority: "Medium",
    duration: 30
  };

  modal(`
    <h2>${id ? "Edit task" : "Add task"}</h2>

    <form onsubmit="event.preventDefault();saveTask('${id}')">
      <label for="taskTitle">Task title</label>
      <input id="taskTitle" required value="${esc(task.title)}">

      <label for="taskSubject">Subject</label>
      <input id="taskSubject" value="${esc(task.subject)}">

      <label for="taskDue">Due date</label>
      <input id="taskDue" type="date" required value="${esc(task.due)}">

      <div class="row">
        <div>
          <label for="taskPriority">Priority</label>
          <select id="taskPriority">
            ${["Low", "Medium", "High"].map(priority => `
              <option ${task.priority === priority ? "selected" : ""}>
                ${priority}
              </option>
            `).join("")}
          </select>
        </div>

        <div>
          <label for="taskDuration">Estimated minutes</label>
          <input id="taskDuration" type="number" min="5" max="1440"
                 required value="${Number(task.duration) || 30}">
        </div>
      </div>

      <div class="quick">
        <button type="submit" class="btn">Save task</button>
        <button type="button" class="btn ghost"
                onclick="closeModal()">Cancel</button>

        ${id ? `
          <button type="button" class="btn danger"
                  onclick="deleteTask('${id}')">Delete</button>
        ` : ""}
      </div>
    </form>
  `);
}

function saveTask(id) {
  const old = state.tasks.find(task => task.id === id);

  const task = {
    ...old,
    id: id || uid(),
    title: field("taskTitle").value.trim(),
    subject: field("taskSubject").value.trim(),
    due: field("taskDue").value,
    priority: field("taskPriority").value,
    duration: Number(field("taskDuration").value),
    done: Boolean(old?.done)
  };

  if (!task.title || !validDate(task.due)) {
    alert("Enter a task title and valid date.");
    return;
  }

  state.tasks = old
    ? state.tasks.map(item => item.id === id ? task : item)
    : [...state.tasks, task];

  persist();
  closeModal();
  render();
}

function deleteTask(id) {
  if (!confirm("Delete this task permanently?")) return;

  state.tasks = state.tasks.filter(task => task.id !== id);
  persist();
  closeModal();
  render();
}

/* =========================================================
   3. CALENDAR
========================================================= */

let calendarMonth = localDate().slice(0, 7) + "-01";
let selectedDate = localDate();

function calendarItems(date) {
  return [
    ...state.events
      .filter(event => event.date === date)
      .map(event => ({ ...event, kind: "event" })),

    ...state.tasks
      .filter(task => task.due === date)
      .map(task => ({
        id: task.id,
        title: task.title,
        kind: "task",
        done: task.done
      }))
  ];
}

function pageCalendar(element) {
  const first = parseDate(calendarMonth);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0
  ).getDate();

  const cells = [
    ...Array(offset).fill(null),
    ...Array.from({ length: count }, (_, index) =>
      addDays(calendarMonth, index)
    )
  ];

  const selected = calendarItems(selectedDate);

  element.innerHTML = `
    <h1>Calendar</h1>
    <p class="sub">Your deadlines, events, and reminders in one place.</p>

    <div class="row" style="margin-bottom:18px">
      <button class="btn ghost" onclick="moveMonth(-1)">Previous</button>

      <strong style="align-self:center;text-align:center">
        ${first.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric"
        })}
      </strong>

      <button class="btn ghost" onclick="moveMonth(1)">Next</button>
      <button class="btn" onclick="eventForm()">+ Add event</button>
    </div>

    <section class="card">
      <div class="calendar">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          .map(day => `<div class="cal-head">${day}</div>`).join("")}

        ${cells.map(date => {
          if (!date) return "<div></div>";

          const items = calendarItems(date);

          return `
            <div class="day
                  ${date === localDate() ? "today" : ""}
                  ${date === selectedDate ? "selected" : ""}"
                 role="button" tabindex="0"
                 onclick="selectCalendarDate('${date}')"
                 onkeydown="if(event.key==='Enter')selectCalendarDate('${date}')">

              <div class="num">${parseDate(date).getDate()}</div>

              ${items.slice(0, 2).map(item => `
                <div class="ev">
                  ${item.done ? "✓ " : ""}${esc(item.title)}
                </div>
              `).join("")}

              ${items.length > 2
                ? `<div class="ev">+${items.length - 2} more</div>`
                : ""}
            </div>
          `;
        }).join("")}
      </div>
    </section>

    <section class="card" style="margin-top:20px">
      <h2>${dateLabel(selectedDate)}</h2>

      ${selected.length ? selected.map(item => `
        <div class="task">
          <div style="flex:1">
            <div class="title">${esc(item.title)}</div>
            <div class="meta">
              ${item.kind === "task"
                ? "Task deadline" + (item.done ? " · Completed" : "")
                : esc(item.type || "Event")}
            </div>
          </div>

          <button class="btn ghost small"
                  onclick="${item.kind === "task" ? "taskForm" : "eventForm"}('${item.id}')">
            Edit
          </button>
        </div>
      `).join("") : `
        <div class="empty">No events or deadlines on this day.</div>
      `}
    </section>
  `;
}

function moveMonth(amount) {
  const date = parseDate(calendarMonth);
  date.setMonth(date.getMonth() + amount);
  calendarMonth = localDate(date);
  render();
}

function selectCalendarDate(date) {
  selectedDate = date;
  render();
}

function eventForm(id = "") {
  const item = state.events.find(event => event.id === id) || {
    title: "",
    date: selectedDate,
    type: "Reminder",
    notes: ""
  };

  modal(`
    <h2>${id ? "Edit event" : "Add event"}</h2>

    <form onsubmit="event.preventDefault();saveEvent('${id}')">
      <label for="eventTitle">Title</label>
      <input id="eventTitle" required value="${esc(item.title)}">

      <label for="eventDate">Date</label>
      <input id="eventDate" type="date" required value="${esc(item.date)}">

      <label for="eventType">Type</label>
      <select id="eventType">
        ${["Exam", "Assignment deadline", "Personal event", "Reminder"]
          .map(type => `
            <option ${item.type === type ? "selected" : ""}>
              ${type}
            </option>
          `).join("")}
      </select>

      <label for="eventNotes">Notes</label>
      <textarea id="eventNotes" rows="3">${esc(item.notes)}</textarea>

      <div class="quick">
        <button class="btn" type="submit">Save event</button>
        <button type="button" class="btn ghost"
                onclick="closeModal()">Cancel</button>

        ${id ? `
          <button type="button" class="btn danger"
                  onclick="deleteEvent('${id}')">Delete</button>
        ` : ""}
      </div>
    </form>
  `);
}

function saveEvent(id) {
  const item = {
    id: id || uid(),
    title: field("eventTitle").value.trim(),
    date: field("eventDate").value,
    type: field("eventType").value,
    notes: field("eventNotes").value.trim()
  };

  if (!item.title || !validDate(item.date)) return;

  state.events = state.events.some(event => event.id === id)
    ? state.events.map(event => event.id === id ? item : event)
    : [...state.events, item];

  persist();
  closeModal();
  render();
}

function deleteEvent(id) {
  if (!confirm("Delete this event?")) return;

  state.events = state.events.filter(event => event.id !== id);
  persist();
  closeModal();
  render();
}

/* =========================================================
   4. FOCUS TIMER
========================================================= */

function freshTimer() {
  return {
    mode: "focus",
    totalMs: Number(state.settings.focus) * 60000,
    remainingMs: Number(state.settings.focus) * 60000,
    running: false,
    endAt: null,
    taskId: ""
  };
}

let timer = load("timer", null) || freshTimer();

if (
  !Number.isFinite(timer.totalMs) ||
  timer.totalMs <= 0 ||
  !Number.isFinite(timer.remainingMs) ||
  (timer.running && !Number.isFinite(timer.endAt))
) {
  timer = freshTimer();
}

function saveTimer() {
  save("timer", timer);
}

function remainingTimerMs() {
  return timer.running
    ? Math.max(0, timer.endAt - Date.now())
    : Math.max(0, timer.remainingMs);
}

function timerText() {
  const seconds = Math.ceil(remainingTimerMs() / 1000);

  return String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":" + String(seconds % 60).padStart(2, "0");
}

function pageTimer(element) {
  element.innerHTML = `
    <h1>Focus Timer</h1>
    <p class="sub">One task. A little quiet. A fresh start.</p>

    <div class="grid g2">
      <section class="card" style="text-align:center">
        <div class="quick" style="justify-content:center">
          ${[15, 25, 50].map(minutes => `
            <button class="btn ghost small"
                    onclick="setTimerDuration(${minutes},'focus')">
              ${minutes} min
            </button>
          `).join("")}

          <button class="btn ghost small" onclick="customTimer()">
            Custom
          </button>
        </div>

        <div class="timer-display" id="timerDisplay">${timerText()}</div>
        <div class="progress"><i id="timerProgress"></i></div>

        <p class="sub" style="margin-top:16px">
          ${timer.mode === "focus" ? "Focus session" : "Rest and recharge"}
        </p>

        <div class="quick" style="justify-content:center">
          <button class="btn" onclick="toggleTimer()">
            ${timer.running
              ? "Pause"
              : timer.remainingMs < timer.totalMs ? "Resume" : "Start"}
          </button>

          <button class="btn ghost" onclick="resetTimer()">Reset</button>
        </div>

        <div class="quick" style="justify-content:center;margin-top:20px">
          <button class="btn ghost small"
                  onclick="setTimerDuration(${state.settings.short},'break')">
            Short break
          </button>
          <button class="btn ghost small"
                  onclick="setTimerDuration(${state.settings.long},'break')">
            Long break
          </button>
        </div>
      </section>

      <section class="card">
        <h2>Session preferences</h2>

        <label for="timerTask">Optional task</label>
        <select id="timerTask"
                onchange="timer.taskId=this.value;saveTimer()"
                ${timer.running ? "disabled" : ""}>
          <option value="">No specific task</option>
          ${state.tasks.filter(task => !task.done).map(task => `
            <option value="${task.id}"
                    ${timer.taskId === task.id ? "selected" : ""}>
              ${esc(task.title)}
            </option>
          `).join("")}
        </select>

        <label for="focusPreference">Focus minutes</label>
        <input id="focusPreference" type="number" min="1" max="180"
               value="${state.settings.focus}">

        <div class="row">
          <div>
            <label for="shortPreference">Short break</label>
            <input id="shortPreference" type="number" min="1" max="120"
                   value="${state.settings.short}">
          </div>
          <div>
            <label for="longPreference">Long break</label>
            <input id="longPreference" type="number" min="1" max="120"
                   value="${state.settings.long}">
          </div>
        </div>

        <button class="btn ghost" style="margin-top:16px"
                onclick="applyTimerPreferences()">Save durations</button>

        <h2 style="margin-top:25px">Recent focus sessions</h2>

        ${state.sessions.slice(-4).reverse().map(session => `
          <div class="task">
            <div>
              <div class="title">${esc(session.task || "Focus session")}</div>
              <div class="meta">
                ${dateLabel(session.date)} · ${minutesLabel(session.minutes)}
              </div>
            </div>
          </div>
        `).join("") || '<div class="empty">Your first session starts here.</div>'}
      </section>
    </div>
  `;

  updateTimerDisplay();
}

function updateTimerDisplay() {
  if (field("timerDisplay")) {
    field("timerDisplay").textContent = timerText();
  }

  if (field("timerProgress")) {
    field("timerProgress").style.width = Math.min(
      100,
      Math.max(0, 100 * (1 - remainingTimerMs() / timer.totalMs))
    ) + "%";
  }
}

function setTimerDuration(minutes, mode = "focus") {
  const inProgress = timer.running || timer.remainingMs < timer.totalMs;

  if (
    inProgress &&
    !confirm("Replace this session? Unfinished time will not be recorded.")
  ) return;

  timer.mode = mode;
  timer.totalMs = numberIn(minutes, 1, 180, 25) * 60000;
  timer.remainingMs = timer.totalMs;
  timer.running = false;
  timer.endAt = null;

  saveTimer();
  render();
}

function customTimer() {
  const value = prompt("Focus duration in minutes:", "30");
  if (value === null) return;

  const minutes = Number(value);

  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) {
    alert("Choose a duration from 1 to 180 minutes.");
    return;
  }

  setTimerDuration(minutes, "focus");
}

function toggleTimer() {
  if (timer.running) {
    timer.remainingMs = remainingTimerMs();
    timer.running = false;
    timer.endAt = null;
  } else {
    timer.endAt = Date.now() + timer.remainingMs;
    timer.running = true;
  }

  saveTimer();
  render();
}

function resetTimer() {
  if (
    (timer.running || timer.remainingMs < timer.totalMs) &&
    !confirm("Reset this session? Unfinished time will not be recorded.")
  ) return;

  timer.running = false;
  timer.endAt = null;
  timer.remainingMs = timer.totalMs;

  saveTimer();
  render();
}

function applyTimerPreferences() {
  state.settings.focus = numberIn(field("focusPreference").value, 1, 180, 25);
  state.settings.short = numberIn(field("shortPreference").value, 1, 120, 5);
  state.settings.long = numberIn(field("longPreference").value, 1, 120, 15);

  if (!timer.running && timer.remainingMs === timer.totalMs) {
    timer = freshTimer();
  }

  persist();
  saveTimer();
  render();
}

function quickStartFocus() {
  if (!timer.running && timer.remainingMs < timer.totalMs) {
    location.hash = "#timer";
    return;
  }

  if (!timer.running) {
    timer = freshTimer();
    timer.running = true;
    timer.endAt = Date.now() + timer.remainingMs;
    saveTimer();
  }

  if (route() === "timer") render();
  else location.hash = "#timer";
}

function finishTimer() {
  const finishedAt = new Date(timer.endAt || Date.now());
  const wasFocus = timer.mode === "focus";

  timer.running = false;

  if (wasFocus) {
    const task = state.tasks.find(item => item.id === timer.taskId);

    state.sessions.push({
      id: uid(),
      date: localDate(finishedAt),
      at: finishedAt.toISOString(),
      seconds: timer.totalMs / 1000,
      minutes: timer.totalMs / 60000,
      taskId: timer.taskId,
      task: task?.title || "Focus session"
    });

    timer.mode = "break";
    timer.totalMs = state.settings.short * 60000;
  } else {
    timer.mode = "focus";
    timer.totalMs = state.settings.focus * 60000;
  }

  timer.remainingMs = timer.totalMs;
  timer.endAt = null;

  persist();
  saveTimer();
  render();

  setTimeout(() => {
    alert(wasFocus
      ? "Focus session complete. Nice work! Take a short break."
      : "Break finished. Start again whenever you're ready.");
  }, 50);
}

setInterval(() => {
  if (!timer.running) return;

  if (remainingTimerMs() <= 0) finishTimer();
  else updateTimerDisplay();
}, 250);

/* =========================================================
   5. STUDY COMPANION
   Conversation and draft roadmap are memory-only.
   No API calls. No HTML preview strings in chat.
========================================================= */

let companionDraft = null;
let companionLastPrompt = "";
let companionError = "";

function pageCompanion(element) {
  element.innerHTML = `
    <h1>Study Companion</h1>
    <p class="sub">
      Describe your subjects, deadline, and daily study time.
      Your conversation restarts whenever you refresh or reopen the website.
    </p>

    <div class="grid g2">
      <section class="card chat" style="height:650px">
        <h2>Your planning space</h2>

        <div class="messages" id="companionMessages" aria-live="polite">
          ${state.chat.length
            ? state.chat.map(message => `
                <div class="msg ${message.role === "user" ? "user" : "bot"}">
                  ${esc(message.text)}
                </div>
              `).join("")
            : `
              <div class="msg bot">Welcome! Let's build a manageable study plan.

Try: Subjects: maths, biology. Plan 7 days with 2 hours per day.

You can edit each suggested task before saving.</div>
            `}
        </div>

        ${companionError
          ? `<div class="warn" role="alert">${esc(companionError)}</div>`
          : ""}

        <label for="companionPrompt">Your study prompt</label>

        <textarea id="companionPrompt" rows="4" maxlength="6000"
          placeholder="Subjects: algebra, biology. Plan 10 days with 90 minutes per day. Include revision."></textarea>

        <div class="quick">
          <button class="btn" onclick="companionSend()">Create roadmap</button>
          <button class="btn ghost" onclick="clearConversation()">Restart chat</button>
        </div>

        <p class="sub" style="font-size:11px;margin:14px 0 0">
          Local planner, not a live AI model. Conversation and unsaved
          previews are not stored.
        </p>
      </section>

      <section class="card">
        <h2>Roadmap preview</h2>
        ${roadmapPreview()}
      </section>
    </div>
  `;

  const messages = field("companionMessages");
  messages.scrollTop = messages.scrollHeight;
}

function roadmapPreview() {
  if (!companionDraft) {
    return `
      <div class="empty">
        <h2>A little planning goes a long way.</h2>
        <p>Enter a prompt to create your roadmap.</p>
      </div>
    `;
  }

  const groups = {};

  companionDraft.tasks.forEach((task, index) => {
    (groups[task.due] ||= []).push({ task, index });
  });

  return `
    <span class="pill">Local study planner</span>

    <h3 style="margin-top:16px">${esc(companionDraft.title)}</h3>
    <p class="sub">${esc(companionDraft.summary)}</p>

    ${companionDraft.assumptions.length ? `
      <details style="margin-bottom:18px">
        <summary style="cursor:pointer">Planning assumptions</summary>
        <ul>
          ${companionDraft.assumptions.map(item =>
            `<li>${esc(item)}</li>`
          ).join("")}
        </ul>
      </details>
    ` : ""}

    ${Object.keys(groups).sort().map(date => {
      const minutes = groups[date].reduce(
        (sum, item) => sum + Number(item.task.duration), 0
      );

      return `
        <h3 style="margin-top:20px">
          ${dateLabel(date)} · ${minutesLabel(minutes)}
        </h3>

        ${groups[date].map(({ task, index }) => `
          <div class="task">
            <div style="flex:1">
              <div class="title">${esc(task.title)}</div>
              <div class="meta">
                ${esc(task.subject)} · ${minutesLabel(task.duration)} ·
                ${esc(task.priority)}
              </div>
            </div>

            <button class="btn ghost small"
                    onclick="editRoadmapTask(${index})">Edit</button>

            <button class="btn ghost small"
                    onclick="removeRoadmapTask(${index})">Remove</button>
          </div>
        `).join("")}
      `;
    }).join("")}

    ${!companionDraft.tasks.length ? `
      <div class="empty">
        No new tasks fit this plan. Increase the available time,
        extend the deadline, or adjust existing tasks.
      </div>
    ` : ""}

    <h3 style="margin-top:20px">Keep it manageable</h3>
    <ul>
      ${companionDraft.advice.map(item => `<li>${esc(item)}</li>`).join("")}
    </ul>

    <div class="quick">
      <button class="btn" onclick="saveRoadmap()"
              ${!companionDraft.tasks.length ? "disabled" : ""}>
        Add to planner
      </button>

      <button class="btn ghost" onclick="regenerateRoadmap()">
        Regenerate
      </button>
    </div>

    <p class="sub" style="font-size:11px;margin:15px 0 0">
      This preview disappears on refresh unless you add it to the planner.
    </p>
  `;
}

function localRoadmap(promptText, variation = 0) {
  const lower = promptText.toLowerCase();
  const assumptions = [];

  const dayMatch = lower.match(/(\d+)\s*days?\b/);
  const weekMatch = lower.match(/(\d+)\s*weeks?\b/);
  const dateMatch = promptText.match(/\b(\d{4}-\d{2}-\d{2})\b/);

  let days = dayMatch
    ? Number(dayMatch[1])
    : weekMatch
    ? Number(weekMatch[1]) * 7
    : 7;

  if (dateMatch && validDate(dateMatch[1])) {
    const deadline = parseDate(dateMatch[1]);
    const today = parseDate(localDate());

    if (deadline < today) {
      throw new Error("Please choose a deadline that is today or later.");
    }

    // UTC calendar-day arithmetic avoids daylight-saving offsets.
    const utcDay = date => Date.UTC(
      date.getFullYear(), date.getMonth(), date.getDate()
    );

    days = Math.round((utcDay(deadline) - utcDay(today)) / 86400000) + 1;
  }

  if (!dayMatch && !weekMatch && !dateMatch) {
    assumptions.push("No deadline was detected, so the plan covers 7 days.");
  }

  if (days > 30) {
    assumptions.push("This preview covers the first 30 days.");
  }

  days = Math.round(numberIn(days, 1, 30, 7));

  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
  const minuteMatch = lower.match(/(\d+)\s*(?:minutes?|mins?)\b/);

  let dailyMinutes = hourMatch
    ? Number(hourMatch[1]) * 60
    : minuteMatch
    ? Number(minuteMatch[1])
    : Number(state.settings.dailyGoal) || 120;

  dailyMinutes = Math.round(numberIn(dailyMinutes, 5, 720, 120));

  if (!hourMatch && !minuteMatch) {
    assumptions.push(
      `Using ${dailyMinutes} minutes per day from your study goal.`
    );
  } else {
    assumptions.push(
      "The time entered in your prompt is treated as a daily study allowance."
    );
  }

  let subjects = [];

  const explicit = promptText.match(
    /subjects?\s*:\s*([^.;\n]+)/i
  );

  if (explicit) {
    subjects = explicit[1]
      .split(/,|&|\band\b/i)
      .map(subject => subject.trim())
      .filter(Boolean);
  } else {
    const known = [
      ["Mathematics", /\b(math|maths|mathematics)\b/i],
      ["Biology", /\bbiology\b/i],
      ["Chemistry", /\bchemistry\b/i],
      ["Physics", /\bphysics\b/i],
      ["English", /\benglish\b/i],
      ["History", /\bhistory\b/i],
      ["Geography", /\bgeography\b/i],
      ["Economics", /\beconomics\b/i],
      ["Computer Science", /\bcomputer science\b/i],
      ["Python", /\bpython\b/i],
      ["JavaScript", /\bjavascript\b/i],
      ["Java", /\bjava\b/i],
      ["Algebra", /\balgebra\b/i],
      ["Geometry", /\bgeometry\b/i],
      ["Probability", /\bprobability\b/i]
    ];

    subjects = known
      .filter(([, expression]) => expression.test(promptText))
      .map(([name]) => name);

    if (subjects.some(subject =>
      ["Algebra", "Geometry", "Probability"].includes(subject)
    )) {
      subjects = subjects.filter(subject => subject !== "Mathematics");
    }
  }

  if (!subjects.length) {
    const phrase = promptText.match(
      /(?:study|learn|revise|prepare for)\s+(.+?)(?:\s+for\s+\d|\s+in\s+\d|[.;\n]|$)/i
    );

    const candidate = phrase?.[1]
      ?.replace(/\s+(exam|test)$/i, "")
      .trim();

    if (candidate && candidate.length < 90) {
      subjects = candidate
        .split(/,|&|\band\b/i)
        .map(subject => subject.trim())
        .filter(Boolean);
    }
  }

  subjects = [...new Set(subjects)].slice(0, 8);

  if (!subjects.length) {
    throw new Error(
      "Please name your subjects. Example: Subjects: maths, biology. " +
      "7 days, 2 hours per day."
    );
  }

  const tasks = [];
  let subjectIndex = variation;
  let fullDays = 0;

  for (let index = 0; index < days && tasks.length < 60; index++) {
    const due = addDays(localDate(), index);

    const savedMinutes = state.tasks
      .filter(task => !task.done && task.due === due)
      .reduce((total, task) => total + Number(task.duration || 0), 0);

    const available = Math.max(0, dailyMinutes - savedMinutes);

    if (available < 5) {
      fullDays++;
      continue;
    }

    const slots = Math.min(
      subjects.length,
      2,
      Math.max(1, Math.floor(available / 25))
    );

    const perSlot = Math.floor(available / slots);

    for (let slot = 0; slot < slots && tasks.length < 60; slot++) {
      const subject = subjects[subjectIndex++ % subjects.length];

      const phase = index === days - 1
        ? "Review key ideas and test yourself"
        : (index + variation) % 3 === 2
        ? "Revise earlier work and correct mistakes"
        : (index + variation) % 3 === 1
        ? "Practise questions and check understanding"
        : "Study the next topic and write brief notes";

      let remaining = perSlot;
      let block = 1;

      while (remaining >= 5 && tasks.length < 60) {
        // Avoid leaving an unusable remainder of 1–4 minutes.
        let duration = Math.min(50, remaining);

        if (remaining > 50 && remaining - duration < 5) {
          duration -= 5 - (remaining - duration);
        }

        tasks.push({
          title: `${subject}: ${phase}${block > 1 ? ` — part ${block}` : ""}`,
          subject,
          due,
          duration,
          priority: index >= days - 2 ? "High" : "Medium"
        });

        remaining -= duration;
        block++;
      }
    }
  }

  assumptions.push(
    "Pending saved task estimates are deducted from each day's allowance."
  );

  assumptions.push(
    "This local planner recognises basic subjects and time limits, " +
    "but does not interpret a full syllabus or complex conversation."
  );

  if (fullDays) {
    assumptions.push(
      `${fullDays} day(s) had no room after existing pending tasks.`
    );
  }

  if (tasks.length === 60) {
    assumptions.push(
      "The preview is limited to 60 tasks. Plan the next phase separately."
    );
  }

  return {
    title: `${subjects.join(" & ")} study roadmap`,
    summary:
      `A ${days}-day plan with up to ${dailyMinutes} study minutes per day, ` +
      "including existing pending task estimates.",
    assumptions,
    advice: [
      "Take short breaks between focus blocks; breaks are extra to the study-minute allowance.",
      "Use practice questions to find topics that need another pass.",
      "Edit the suggested tasks to match your actual syllabus.",
      "Calendar events do not automatically reduce available study time in local mode."
    ],
    tasks
  };
}

function companionSend() {
  const input = field("companionPrompt");
  const promptText = input?.value.trim();

  if (!promptText) {
    input?.focus();
    return;
  }

  companionError = "";

  state.chat.push({
    role: "user",
    text: promptText
  });

  try {
    const plan = localRoadmap(promptText);

    companionDraft = plan;
    companionLastPrompt = promptText;

    state.chat.push({
      role: "bot",
      text:
        `${plan.title}\n\n${plan.summary}\n\n` +
        `${plan.tasks.length} task(s) are ready in the preview. ` +
        "Edit them before adding them to your planner.\n\n" +
        "This plan was generated locally using planning rules."
    });
  } catch (error) {
    companionError = error.message;

    state.chat.push({
      role: "bot",
      text: error.message
    });
  }

  // No conversation or draft is written to localStorage.
  render();
}

function regenerateRoadmap() {
  if (!companionLastPrompt) return;

  try {
    companionDraft = localRoadmap(
      companionLastPrompt,
      Math.floor(Math.random() * 5) + 1
    );

    companionError = "";

    state.chat.push({
      role: "bot",
      text:
        "Created another version of your roadmap. " +
        "Review the preview before saving."
    });
  } catch (error) {
    companionError = error.message;
  }

  render();
}

function editRoadmapTask(index) {
  const task = companionDraft?.tasks[index];
  if (!task) return;

  modal(`
    <h2>Edit suggested task</h2>

    <form onsubmit="event.preventDefault();applyRoadmapEdit(${index})">
      <label for="roadmapTitle">Title</label>
      <input id="roadmapTitle" required value="${esc(task.title)}">

      <label for="roadmapSubject">Subject</label>
      <input id="roadmapSubject" required value="${esc(task.subject)}">

      <label for="roadmapDate">Due date</label>
      <input id="roadmapDate" type="date" required value="${esc(task.due)}">

      <label for="roadmapDuration">Minutes</label>
      <input id="roadmapDuration" type="number" min="5" max="180"
             required value="${Number(task.duration)}">

      <label for="roadmapPriority">Priority</label>
      <select id="roadmapPriority">
        ${["Low", "Medium", "High"].map(priority => `
          <option ${task.priority === priority ? "selected" : ""}>
            ${priority}
          </option>
        `).join("")}
      </select>

      <div class="quick">
        <button type="submit" class="btn">Save preview changes</button>
        <button type="button" class="btn ghost"
                onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `);
}

function applyRoadmapEdit(index) {
  const task = {
    title: field("roadmapTitle").value.trim(),
    subject: field("roadmapSubject").value.trim(),
    due: field("roadmapDate").value,
    duration: Number(field("roadmapDuration").value),
    priority: field("roadmapPriority").value
  };

  if (
    !task.title ||
    !task.subject ||
    !validDate(task.due) ||
    task.duration < 5 ||
    task.duration > 180
  ) return;

  companionDraft.tasks[index] = task;
  closeModal();
  render();
}

function removeRoadmapTask(index) {
  if (!companionDraft) return;

  companionDraft.tasks.splice(index, 1);
  render();
}

function saveRoadmap() {
  if (!companionDraft?.tasks?.length) return;

  const signature = task => JSON.stringify([
    String(task.title).trim().toLowerCase(),
    String(task.subject || "").trim().toLowerCase(),
    task.due
  ]);

  const existing = new Set(state.tasks.map(signature));
  const additions = [];

  for (const task of companionDraft.tasks) {
    const key = signature(task);

    if (!existing.has(key)) {
      additions.push(task);
      existing.add(key);
    }
  }

  if (!additions.length) {
    alert("These tasks are already in your planner.");
    return;
  }

  if (!confirm(
    `Add ${additions.length} tasks to My Tasks?\n\n` +
    "They will remain saved after the chatbot restarts. " +
    "Their due dates will appear in Calendar."
  )) return;

  state.tasks.push(
    ...additions.map(task => ({
      ...task,
      id: uid(),
      done: false,
      completedAt: null,
      completedDate: null,
      source: "study-companion"
    }))
  );

  state.chat.push({
    role: "bot",
    text: `Added ${additions.length} tasks to your planner.`
  });

  companionDraft = null;

  persist();
  location.hash = "#tasks";
}

function clearConversation() {
  if (
    (state.chat.length || companionDraft) &&
    !confirm("Restart the chat and discard the unsaved preview? Saved tasks remain.")
  ) return;

  state.chat = [];
  companionDraft = null;
  companionLastPrompt = "";
  companionError = "";

  render();
}

/* =========================================================
   6. PROGRESS
========================================================= */

let progressPeriod = "week";

function periodIncludes(date) {
  if (!validDate(date)) return false;
  if (progressPeriod === "all") return true;

  if (progressPeriod === "month") {
    return date.slice(0, 7) === localDate().slice(0, 7);
  }

  const start = weekStart();
  return date >= start && date <= addDays(start, 6);
}

function pageProgress(element) {
  const eligible = state.tasks.filter(task => periodIncludes(task.due));
  const completedEligible = eligible.filter(task => task.done);

  const filteredSessions = state.sessions.filter(
    session => periodIncludes(session.date)
  );

  const completedToday = state.tasks.filter(task =>
    task.done &&
    (task.completedDate || task.completedAt?.slice(0, 10)) === localDate()
  ).length;

  const percent = eligible.length
    ? Math.round(completedEligible.length / eligible.length * 100)
    : null;

  const dates = studyDates();
  const start = weekStart();

  const daysThisWeek = Array.from(
    { length: 7 }, (_, index) => addDays(start, index)
  ).filter(date => dates.has(date)).length;

  const subjects = {};

  eligible.forEach(task => {
    const subject = task.subject || "General";
    subjects[subject] ||= { completed: 0, pending: 0 };
    subjects[subject][task.done ? "completed" : "pending"]++;
  });

  const hasActivity = state.sessions.length ||
    state.tasks.some(task => task.done);

  element.innerHTML = `
    <h1>Progress</h1>
    <p class="sub">Notice your effort. Build consistency at your own pace.</p>

    <div class="tabs">
      ${[
        ["week", "This week"],
        ["month", "This month"],
        ["all", "All time"]
      ].map(([value, label]) => `
        <button class="tab ${progressPeriod === value ? "active" : ""}"
                onclick="setProgressPeriod('${value}')">${label}</button>
      `).join("")}
    </div>

    ${!hasActivity ? `
      <section class="card empty">
        <h2>Your progress starts with one small step.</h2>
        <p>Complete a task or your first focus session.</p>
        <a href="#timer" class="btn">Start focusing</a>
      </section>
    ` : ""}

    <div class="stats" style="margin-top:20px">
      <div class="stat">
        <small>Completed tasks · all time</small>
        <b>${state.tasks.filter(task => task.done).length}</b>
      </div>

      <div class="stat">
        <small>Focus time · all time</small>
        <b>${minutesLabel(focusMinutes(state.sessions))}</b>
      </div>

      <div class="stat">
        <small>Tasks completed today</small>
        <b>${completedToday}</b>
      </div>

      <div class="stat">
        <small>Current study streak</small>
        <b>${currentStreak()} days</b>
      </div>
    </div>

    <div class="grid g2">
      <section class="card">
        <h2>This week's focus</h2>
        ${weeklyFocusChart()}
      </section>

      <section class="card">
        <h2>Task completion · selected period</h2>

        ${percent === null ? `
          <p class="sub">No tasks are due in this period.</p>
        ` : `
          <div style="color:var(--accent);font-size:42px;font-weight:700">
            ${percent}%
          </div>

          <div class="progress" style="margin:12px 0">
            <i style="width:${percent}%"></i>
          </div>

          <p class="sub">
            ${completedEligible.length} of ${eligible.length}
            tasks due in this period are completed.
          </p>
        `}

        <h2>Study consistency</h2>

        <p class="sub">
          ${daysThisWeek} study day(s) this week.
          A study day requires at least one completed focus session.
        </p>

        <p class="sub" style="margin-bottom:0">
          Focus time in selected period:
          ${minutesLabel(focusMinutes(filteredSessions))}.
        </p>
      </section>
    </div>

    <section class="card" style="margin-top:20px">
      <h2>Subjects · selected period</h2>

      ${Object.keys(subjects).length
        ? Object.entries(subjects).map(([subject, counts]) => `
            <div class="task">
              <div style="flex:1">
                <div class="title">${esc(subject)}</div>
                <div class="meta">
                  ${counts.completed} completed · ${counts.pending} pending
                </div>
              </div>
            </div>
          `).join("")
        : '<div class="empty">No tasks due in this period.</div>'
      }
    </section>
  `;
}

function setProgressPeriod(value) {
  progressPeriod = value;
  render();
}

/* =========================================================
   7. SETTINGS
========================================================= */

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
}

function pageSettings(element) {
  const settings = state.settings;

  element.innerHTML = `
    <h1>Settings</h1>
    <p class="sub">Simple preferences for your study space.</p>

    <form onsubmit="event.preventDefault();saveSettings()">
      <div class="grid g2">
        <section class="card">
          <h2>Profile</h2>

          <label for="settingName">Display name</label>
          <input id="settingName" maxlength="60" value="${esc(settings.name)}">

          <label for="settingGoal">Daily study goal in minutes · optional</label>
          <input id="settingGoal" type="number" min="0" max="1440"
                 value="${settings.dailyGoal}">
        </section>

        <section class="card">
          <h2>Timer preferences</h2>

          <label for="settingFocus">Focus duration</label>
          <input id="settingFocus" type="number" min="1" max="180"
                 required value="${settings.focus}">

          <div class="row">
            <div>
              <label for="settingShort">Short break</label>
              <input id="settingShort" type="number" min="1" max="120"
                     required value="${settings.short}">
            </div>

            <div>
              <label for="settingLong">Long break</label>
              <input id="settingLong" type="number" min="1" max="120"
                     required value="${settings.long}">
            </div>
          </div>

          <label for="settingTheme">Appearance</label>
          <select id="settingTheme">
            <option value="light" ${settings.theme === "light" ? "selected" : ""}>
              Light forest
            </option>
            <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>
              Dark forest
            </option>
          </select>
        </section>
      </div>

      <button class="btn" type="submit" style="margin-top:20px">
        Save changes
      </button>

      <span id="settingsMessage" role="status"
            style="margin-left:12px;color:var(--muted)"></span>
    </form>

    <section class="card" style="margin-top:24px">
      <h2>Data preferences</h2>

      <p class="sub">
        Clearing study data permanently removes locally saved tasks,
        events, focus sessions, and progress from this browser.
        It also clears the current chat and unsaved roadmap.
        Preferences are kept.
      </p>

      <p class="sub">
        Chat messages and unsaved roadmaps are never stored.
        They reset whenever the website is refreshed or reopened.
      </p>

      <div class="quick">
        <button class="btn danger" onclick="clearStudyData()">
          Clear study data
        </button>

        <button class="btn ghost" onclick="resetDefaults()">
          Reset preferences to defaults
        </button>
      </div>
    </section>
  `;
}

function saveSettings() {
  state.settings = {
    name: field("settingName").value.trim() || "Student",
    dailyGoal: numberIn(field("settingGoal").value, 0, 1440, 0),
    focus: numberIn(field("settingFocus").value, 1, 180, 25),
    short: numberIn(field("settingShort").value, 1, 120, 5),
    long: numberIn(field("settingLong").value, 1, 120, 15),
    theme: field("settingTheme").value
  };

  if (!timer.running && timer.remainingMs === timer.totalMs) {
    timer = freshTimer();
    saveTimer();
  }

  persist();
  applyTheme();
  field("settingsMessage").textContent = "Preferences saved.";
}

function resetDefaults() {
  if (!confirm(
    "Reset preferences to defaults? Your study data will remain."
  )) return;

  state.settings = { ...DEFAULT_SETTINGS };

  if (!timer.running && timer.remainingMs === timer.totalMs) {
    timer = freshTimer();
    saveTimer();
  }

  persist();
  applyTheme();
  render();
}

function clearStudyData() {
  if (!confirm(
    "Permanently delete all locally saved tasks, events, focus sessions, " +
    "and progress?\n\nThis cannot be undone."
  )) return;

  state.tasks = [];
  state.events = [];
  state.sessions = [];
  state.chat = [];

  companionDraft = null;
  companionLastPrompt = "";
  companionError = "";

  timer = freshTimer();

  persist();
  saveTimer();
  render();
}

/* =========================================================
   START APPLICATION
========================================================= */

applyTheme();
render();