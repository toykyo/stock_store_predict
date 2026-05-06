import { NextRequest, NextResponse } from "next/server";

import { getCurrentSectorStocks } from "../../../monitoring/data";

export async function GET(request: NextRequest) {
  const sectorCode = request.nextUrl.searchParams.get("sector");

  if (!sectorCode) {
    return NextResponse.json({ error: "sector query parameter is required" }, { status: 400 });
  }

  const payload = await getCurrentSectorStocks(sectorCode);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
