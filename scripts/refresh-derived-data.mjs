import { closePool, withClient } from "./lib/db.mjs";
import { rebuildFeatureAndTargetTables, rebuildSectorDailySnapshot } from "./repositories/prediction-pipeline.mjs";

async function run() {
  await withClient(async (client) => {
    await rebuildSectorDailySnapshot(client);
    await rebuildFeatureAndTargetTables(client);
  });

  console.log("Derived tables refreshed.");
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
