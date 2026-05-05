import { NextResponse } from "next/server";

import { getMonitoringOverview } from "../../../monitoring/data";

export async function GET() {
  const payload = await getMonitoringOverview();

  return NextResponse.json(
    {
      latestPredictionDate: payload.latestPredictionDate,
      activeModels: payload.activeModels,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
