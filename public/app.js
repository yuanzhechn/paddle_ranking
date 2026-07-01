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
    el.innerHTML = "<li class=\"muted\">无</li>";
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
    tbody.innerHTML = "<tr><td colspan=\"6\" class=\"muted\">暂无共同团队</td></tr>";
    return;
  }
  for (const [index, row] of rows.entries()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
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
  $("status").textContent = isClosed
    ? "数据已停止自动更新"
    : `GitHub Actions 约每 ${interval} 分钟尝试更新数据，但执行时间由 GitHub 调度，可能会延迟`;
  showError(payload.ok ? "" : `抓取失败：${payload.error || "data/ranking.json unavailable"}`);

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

async function load() {
  $("status").textContent = "正在读取数据...";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`./data/ranking.json?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch (error) {
    const message = error.name === "AbortError" ? "读取数据超时，请稍后刷新页面" : error.message;
    render({ ok: false, error: message, deadlineAt, isClosed: isPastDeadline(deadlineAt) });
  } finally {
    clearTimeout(timeout);
  }
}

load();
if (!isPastDeadline(deadlineAt)) {
  state.timer = setInterval(() => load(), 5 * 60 * 1000);
}
