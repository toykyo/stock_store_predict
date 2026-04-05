import { NextRequest, NextResponse } from "next/server";

import { getStocks } from "../../stocks/data";
import {
  DEFAULT_FILTERS,
  type FilterState,
  type Market,
  type Sector,
} from "../../stocks/shared";

function parseNumber(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFilters(request: NextRequest): FilterState {
  const { searchParams } = request.nextUrl;
  const market = (searchParams.get("market") as Market | null) ?? DEFAULT_FILTERS.market;
  const sector = (searchParams.get("sector") as Sector | null) ?? DEFAULT_FILTERS.sector;

  return {
    market,
    sector,
    perMax: parseNumber(searchParams.get("perMax"), DEFAULT_FILTERS.perMax),
    pbrMax: parseNumber(searchParams.get("pbrMax"), DEFAULT_FILTERS.pbrMax),
    roeMin: parseNumber(searchParams.get("roeMin"), DEFAULT_FILTERS.roeMin),
    volumeRankMax: parseNumber(searchParams.get("volumeRankMax"), DEFAULT_FILTERS.volumeRankMax),
    momentumMin: parseNumber(searchParams.get("momentumMin"), DEFAULT_FILTERS.momentumMin),
  };
}

export async function GET(request: NextRequest) {
  const filters = parseFilters(request);
  const payload = await getStocks(filters);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
