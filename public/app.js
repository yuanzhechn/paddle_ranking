const state = { timer: null };
const deadlineAt = "2026-07-06T12:00:00+08:00";

const $ = (id) => document.getElementById(id);
const fmt = (num) => Number(num || 0).toFixed(2);

function localTime(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(iso));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderList(id, rows) {
  const el = $(id);
  el.innerHTML = "";
  if (!rows.length) {
    el.innerHTML = "<li class=\"muted\">\u65e0</li>";
    return;
  }
  for (const row of rows) {
    const li = document.createElement("li");
    li.textContent = `${row.team}${row.organization ? ` · ${row.organization}` : ""}`;
    el.appendChild(li);
  }
}

function renderTable(rows) {
  const tbody = $("combined");
  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = "<tr><td colspan=\"5\" class=\"muted\">\u6682\u65e0\u5171\u540c\u56e2\u961f</td></tr>";
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.team)}</td>
      <td>${escapeHtml(row.organization || "-")}</td>
      <td>${fmt(row.aScore)}</td>
      <td>${fmt(row.bScore)}</td>
      <td><strong>${fmt(row.total)}</strong></td>
    `;
    tbody.appendChild(tr);
  }
}

function showError(message) {
  const el = $("error");
  el.classList.toggle("hidden", !message);
  el.textContent = message || "";
}

function isPastDeadline(value) {
  return Date.now() >= new Date(value || deadlineAt).getTime();
}

function render(payload) {
  const wrapper = payload.ok ? payload.data : null;
  const interval = wrapper?.config?.refreshIntervalMinutes || 5;
  const finalDeadline = wrapper?.deadlineAt || payload.deadlineAt || deadlineAt;
  const isClosed = Boolean(wrapper?.isClosed || payload.isClosed || isPastDeadline(finalDeadline));
  $("refresh").disabled = false;
  $("status").textContent = isClosed
    ? `\u5df2\u4e8e\u5317\u4eac\u65f6\u95f4 ${localTime(finalDeadline)} \u622a\u6b62\uff0c\u6570\u636e\u505c\u6b62\u5237\u65b0`
    : `GitHub Actions \u6bcf ${interval} \u5206\u949f\u66f4\u65b0\u4e00\u6b21\u6570\u636e\uff1b\u6309\u94ae\u4f1a\u91cd\u65b0\u8bfb\u53d6\u6700\u65b0\u7ed3\u679c\uff1b\u5317\u4eac\u65f6\u95f4 ${localTime(finalDeadline)} \u622a\u6b62`;
  showError(payload.ok ? "" : `\u6293\u53d6\u5931\u8d25\uff1a${payload.error || "data/ranking.json unavailable"}`);

  if (!wrapper) return;
  $("countA").textContent = wrapper.counts.A;
  $("countB").textContent = wrapper.counts.B;
  $("countBoth").textContent = wrapper.combined.length;
  $("refreshedAt").textContent = localTime(wrapper.generatedAt);
  renderList("onlyA", wrapper.onlyA);
  renderList("onlyB", wrapper.onlyB);
  renderTable(wrapper.combined);

  if (isClosed && state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

async function load(manual = false) {
  $("refresh").disabled = true;
  $("status").textContent = manual ? "\u6b63\u5728\u91cd\u65b0\u8bfb\u53d6..." : "\u6b63\u5728\u8bfb\u53d6\u6570\u636e...";
  try {
    const res = await fetch(`./data/ranking.json?t=${Date.now()}`, { cache: "no-store" });
    render(await res.json());
  } catch (error) {
    render({ ok: false, error: error.message, deadlineAt, isClosed: isPastDeadline(deadlineAt) });
  }
}

$("refresh").addEventListener("click", () => load(true));
load();
if (!isPastDeadline(deadlineAt)) {
  state.timer = setInterval(() => load(), 5 * 60 * 1000);
}
