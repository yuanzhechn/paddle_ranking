import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const defaultConfig = {
  competitionId: 1468,
  pageUrl: "https://aistudio.baidu.com/competition/detail/1468/0/leaderboard",
  refreshIntervalMinutes: 5,
  deadline: "2026-07-06T12:00:00+08:00",
  leaderboards: {
    A: { name: "A board", urls: [] },
    B: { name: "B board", urls: [] }
  },
  requestHeaders: {
    referer: "https://aistudio.baidu.com/competition/detail/1468/0/leaderboard",
    "user-agent": "Mozilla/5.0"
  }
};

export function mergeConfig(base, override) {
  return {
    ...base,
    ...override,
    leaderboards: {
      A: { ...base.leaderboards.A, ...(override.leaderboards?.A || {}) },
      B: { ...base.leaderboards.B, ...(override.leaderboards?.B || {}) }
    },
    requestHeaders: { ...base.requestHeaders, ...(override.requestHeaders || {}) }
  };
}

export async function loadConfig(configPath = "config.json") {
  if (!existsSync(configPath)) return defaultConfig;
  const raw = await readFile(configPath, "utf8");
  return mergeConfig(defaultConfig, JSON.parse(raw));
}

function candidateUrls(config, boardKey) {
  const configured = config.leaderboards?.[boardKey]?.urls || [];
  if (configured.length) return configured;

  const id = config.competitionId;
  const board = boardKey.toLowerCase();
  const phase = boardKey === "A" ? 0 : 1;
  return [
    `https://aistudio.baidu.com/studio/competition/rank?competitionId=${id}&stage=${board}&page=1&pageSize=500`,
    `https://aistudio.baidu.com/studio/competition/rank?competitionId=${id}&phase=${phase}&page=1&pageSize=500`,
    `https://aistudio.baidu.com/studio/competition/leaderboard?competitionId=${id}&stage=${board}&page=1&pageSize=500`,
    `https://aistudio.baidu.com/studio/competition/leaderboard?competitionId=${id}&phase=${phase}&page=1&pageSize=500`,
    `https://aistudio.baidu.com/competition/detail/${id}/${phase}/leaderboard?page=1&pageSize=500`
  ];
}

export function collectArrays(value, arrays = []) {
  if (!value || typeof value !== "object") return arrays;
  if (Array.isArray(value)) {
    if (value.length && value.some((item) => item && typeof item === "object")) arrays.push(value);
    value.forEach((item) => collectArrays(item, arrays));
    return arrays;
  }
  Object.values(value).forEach((item) => collectArrays(item, arrays));
  return arrays;
}

function field(item, names) {
  for (const name of names) {
    if (item?.[name] !== undefined && item?.[name] !== null && item?.[name] !== "") return item[name];
  }
  return "";
}

export function normalizeRows(payload) {
  const arrays = collectArrays(payload);
  const best = arrays
    .map((rows) => ({
      rows,
      score: rows.reduce((sum, item) => {
        if (!item || typeof item !== "object") return sum;
        const keys = Object.keys(item).join("|").toLowerCase();
        return sum + (/(team|user|name|rank|score|organization|org|school)/i.test(keys) ? 1 : 0);
      }, 0)
    }))
    .sort((a, b) => b.score - a.score || b.rows.length - a.rows.length)[0];

  if (!best || best.score === 0) return [];

  return best.rows
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      rank: Number(field(item, ["rank", "ranking", "idx", "index", "place", "order", "sort"])) || index + 1,
      team: String(field(item, ["teamName", "team_name", "team", "name", "userName", "username", "nickName", "nickname"]) || "").trim(),
      organization: String(field(item, ["teamOrganization", "organization", "org", "school", "company", "unit"]) || "").trim(),
      raw: item
    }))
    .filter((row) => row.team);
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return JSON.parse(text);
}

async function postForm(url, body, headers) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: new URLSearchParams(body).toString()
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return JSON.parse(text);
}

function assertApiOk(payload, label) {
  if (payload?.errorCode && payload.errorCode !== 0) {
    throw new Error(`${label}: ${payload.errorMsg || payload.errorCode}`);
  }
}

async function fetchProcessList(config) {
  const payload = await postForm(
    "https://aistudio.baidu.com/studio/match/detail",
    { matchId: config.competitionId, signupCode: 0 },
    config.requestHeaders
  );
  assertApiOk(payload, "match detail");
  const processes = payload?.result?.processList || [];
  const findBoard = (name) => processes.find((item) => String(item.processName || "").toUpperCase().includes(name));
  const b = findBoard("B");
  const a = findBoard("A");
  if (!a || !b) {
    throw new Error(`Could not find both A and B boards in processList. Found: ${processes.map((p) => p.processName).join(", ")}`);
  }
  return { A: a, B: b };
}

async function fetchLeaderboardPage(config, processId, page) {
  const payload = await postForm(
    "https://aistudio.baidu.com/studio/match/leaderboard",
    { matchId: config.competitionId, processId, p: page },
    config.requestHeaders
  );
  assertApiOk(payload, `leaderboard ${processId} page ${page}`);
  return payload.result || {};
}

async function fetchBoardByProcess(config, process) {
  const first = await fetchLeaderboardPage(config, process.id, 1);
  const totalPage = Math.max(1, Number(first.totalPage || 1));
  const pages = [first];
  for (let page = 2; page <= totalPage; page += 1) {
    pages.push(await fetchLeaderboardPage(config, process.id, page));
  }

  const byKey = new Map();
  for (const page of pages) {
    for (const item of page.data || []) {
      const key = item.teamId || item.id || `${item.teamName}-${item.rank}`;
      if (!byKey.has(key)) byKey.set(key, item);
    }
  }
  const rows = normalizeRows([...byKey.values()]).sort((left, right) => left.rank - right.rank);
  return {
    rows,
    source: `https://aistudio.baidu.com/studio/match/leaderboard?matchId=${config.competitionId}&processId=${process.id}`,
    process
  };
}

export async function fetchBoardsByPublicApi(config) {
  const processes = await fetchProcessList(config);
  const [a, b] = await Promise.all([
    fetchBoardByProcess(config, processes.A),
    fetchBoardByProcess(config, processes.B)
  ]);
  return { A: a, B: b };
}

export async function fetchBoardByUrls(config, boardKey) {
  const errors = [];
  for (const url of candidateUrls(config, boardKey)) {
    try {
      const payload = await fetchJson(url, config.requestHeaders);
      const rows = normalizeRows(payload);
      if (rows.length) return { rows, source: url };
      errors.push(`${url}: no ranking rows found`);
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  throw new Error(errors.join("\n"));
}

function boardGuessFromUrl(url) {
  const lower = url.toLowerCase();
  if (/[?&](stage|board|type)=a\b/.test(lower) || /[?&](phase|tab)=0\b/.test(lower)) return "A";
  if (/[?&](stage|board|type)=b\b/.test(lower) || /[?&](phase|tab)=1\b/.test(lower)) return "B";
  return null;
}

export async function fetchBoardsByBrowser(config) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ extraHTTPHeaders: config.requestHeaders });
  const candidates = [];

  page.on("response", async (response) => {
    const url = response.url();
    const contentType = response.headers()["content-type"] || "";
    if (!contentType.includes("json")) return;
    if (!/(competition|rank|leader|score|submission|board)/i.test(url)) return;
    try {
      const payload = await response.json();
      const rows = normalizeRows(payload);
      if (rows.length) candidates.push({ url, rows, board: boardGuessFromUrl(url) });
    } catch {
      // Ignore non-ranking JSON.
    }
  });

  await page.goto(config.pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(15000);
  for (const label of ["B榜", "B\u699c", "B", "A榜", "A\u699c", "A"]) {
    try {
      const locator = page.getByText(label, { exact: true }).first();
      if ((await locator.count()) > 0) {
        await locator.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(5000);
      }
    } catch {
      // Best-effort tab discovery.
    }
  }
  await browser.close();

  const byBoard = {};
  for (const item of candidates) {
    if (item.board && (!byBoard[item.board] || item.rows.length > byBoard[item.board].rows.length)) {
      byBoard[item.board] = item;
    }
  }
  if (byBoard.A && byBoard.B) {
    return {
      A: { rows: byBoard.A.rows, source: byBoard.A.url },
      B: { rows: byBoard.B.rows, source: byBoard.B.url }
    };
  }

  const sorted = candidates.sort((a, b) => b.rows.length - a.rows.length);
  if (sorted.length >= 2) {
    return {
      A: { rows: sorted[0].rows, source: sorted[0].url },
      B: { rows: sorted[1].rows, source: sorted[1].url }
    };
  }

  throw new Error(`Browser probe did not find both boards. Found ${candidates.length} candidate ranking responses.`);
}

function rankScore(rank, count) {
  if (count <= 1) return 100;
  return ((count - rank) / (count - 1)) * 100;
}

function keyOf(row) {
  return `${row.team}@@${row.organization}`;
}

export function compute(aRows, bRows) {
  const aMap = new Map(aRows.map((row) => [keyOf(row), row]));
  const bMap = new Map(bRows.map((row) => [keyOf(row), row]));
  const onlyA = aRows.filter((row) => !bMap.has(keyOf(row)));
  const onlyB = bRows.filter((row) => !aMap.has(keyOf(row)));
  const combined = aRows
    .filter((row) => bMap.has(keyOf(row)))
    .map((aRow) => {
      const bRow = bMap.get(keyOf(aRow));
      const aScore = rankScore(aRow.rank, aRows.length);
      const bScore = rankScore(bRow.rank, bRows.length);
      return {
        team: aRow.team,
        organization: aRow.organization || bRow.organization,
        aScore,
        bScore,
        total: aScore * 0.3 + bScore * 0.7,
        aRank: aRow.rank,
        bRank: bRow.rank
      };
    })
    .sort((left, right) => right.total - left.total);

  return { onlyA, onlyB, combined };
}

export async function buildRankingData(config) {
  const deadlineAt = config.deadline || null;
  let boards;
  try {
    boards = await fetchBoardsByPublicApi(config);
  } catch (publicApiError) {
    try {
      const [a, b] = await Promise.all([fetchBoardByUrls(config, "A"), fetchBoardByUrls(config, "B")]);
      boards = { A: a, B: b };
    } catch (urlError) {
      try {
        boards = await fetchBoardsByBrowser(config);
      } catch (browserError) {
        throw new Error(
          `Public API failed:\n${publicApiError.message}\n\nURL probe failed:\n${urlError.message}\n\nBrowser probe failed:\n${browserError.message}`
        );
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    deadlineAt,
    isClosed: deadlineAt ? Date.now() >= new Date(deadlineAt).getTime() : false,
    config: {
      competitionId: config.competitionId,
      refreshIntervalMinutes: config.refreshIntervalMinutes,
      deadline: deadlineAt
    },
    sources: { A: boards.A.source, B: boards.B.source },
    counts: { A: boards.A.rows.length, B: boards.B.rows.length },
    boards: { A: boards.A.rows, B: boards.B.rows },
    ...compute(boards.A.rows, boards.B.rows)
  };
}
