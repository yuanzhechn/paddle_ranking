import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { buildRankingData, loadConfig } from "./ranking-core.js";

const outputPath = process.argv[2] || "public/data/ranking.json";

async function writeJson(value) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(value, null, 2), "utf8");
}

async function main() {
  const config = await loadConfig();
  const deadlineAt = config.deadline || null;
  if (deadlineAt && Date.now() >= new Date(deadlineAt).getTime()) {
    let previous = null;
    try {
      previous = JSON.parse(await readFile(outputPath, "utf8"));
    } catch {
      previous = null;
    }
    if (previous?.ok && previous.data) {
      previous.data.deadlineAt = deadlineAt;
      previous.data.isClosed = true;
      previous.data.config = { ...previous.data.config, deadline: deadlineAt };
      await writeJson(previous);
    } else {
      await writeJson({
        ok: false,
        error: `Ranking refresh stopped at deadline ${deadlineAt}.`,
        generatedAt: new Date().toISOString(),
        deadlineAt,
        isClosed: true
      });
    }
    console.log(`Deadline reached: ${deadlineAt}.`);
    return;
  }

  const data = await buildRankingData(config);
  await writeJson({ ok: true, data });
  console.log(`Wrote ${outputPath}`);
  console.log(`A: ${data.counts.A}, B: ${data.counts.B}, both: ${data.combined.length}`);
}

main().catch(async (error) => {
  await writeJson({
    ok: false,
    error: error.message,
    generatedAt: new Date().toISOString(),
    deadlineAt: "2026-07-06T12:00:00+08:00",
    isClosed: false
  });
  console.error(error);
  process.exitCode = 1;
});
