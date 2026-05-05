import { NextRequest, NextResponse } from "next/server";

import { getStocks } from "../../stocks/data";
import { DEFAULT_FILTERS, type FilterState, type Market } from "../../stocks/shared";

function parseNumber(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) {
    return fallback;
  }

  return value === "true";
}

function parseFilters(request: NextRequest): FilterState {
  const { searchParams } = request.nextUrl;

  return {
    market: (searchParams.get("market") as Market | null) ?? DEFAULT_FILTERS.market,
    sector: searchParams.get("sector") ?? DEFAULT_FILTERS.sector,
    query: searchParams.get("query") ?? DEFAULT_FILTERS.query,
    minChangePct: parseNumber(searchParams.get("minChangePct"), DEFAULT_FILTERS.minChangePct),
    minTradingValue: parseNumber(searchParams.get("minTradingValue"), DEFAULT_FILTERS.minTradingValue),
    onlyCommonStock: parseBoolean(searchParams.get("onlyCommonStock"), DEFAULT_FILTERS.onlyCommonStock),
    excludeRiskSegments: parseBoolean(searchParams.get("excludeRiskSegments"), DEFAULT_FILTERS.excludeRiskSegments),
  };
}

export async function GET(request: NextRequest) {
  const filters = parseFilters(request);
  const sort = request.nextUrl.searchParams.get("sort") ?? "score";
  const payload = await getStocks(filters, sort);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}