import { closePool, withClient } from "./lib/db.mjs";
import { getIndustryClassificationStatus } from "./repositories/industry-classification.mjs";

function parseArgs(argv) {
  const args = { staleAfterDays: 30 };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const next = argv[index + 1];
    if (raw === "--stale-after-days" && next) {
      args.staleAfterDays = Number(next);
      index += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const status = await withClient((client) => getIndustryClassificationStatus(client, args.staleAfterDays));

  console.log(`Industry classification rows: ${status.classificationCount}`);
  console.log(`Missing classifications: ${status.missingCount}`);
  console.log(`Last collected at: ${status.lastCollectedAt ? status.lastCollectedAt.toISOString() : "never"}`);
  console.log(`Age days: ${status.ageDays ?? "n/a"}`);

  if (status.isStale) {
    console.log(`WARNING: Industry classification has not been updated within ${status.staleAfterDays} days.`);
  }

  if (status.hasMissing) {
    console.log("WARNING: Some stock_master rows do not have current industry classification rows.");
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });