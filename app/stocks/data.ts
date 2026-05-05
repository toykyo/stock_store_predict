import { Pool } from "pg";

import { DEFAULT_FILTERS, type FilterState, type Stock, type StocksApiResponse } from "./shared";

const ALL_MARKET = "\uC804\uCCB4";
const UNCATEGORIZED = "\uBBF8\uBD84\uB958";
const COMMON_STOCK = "\uBCF4\uD1B5\uC8FC";
const RISK_SEGMENTS = [
  "SPAC(\uC18C\uC18D\uBD80\uC5C6\uC74C)",
  "\uAD00\uB9AC\uC885\uBAA9(\uC18C\uC18D\uBD80\uC5C6\uC74C)",
  "\uD22C\uC790\uC8FC\uC758\uD658\uAE30\uC885\uBAA9(\uC18C\uC18D\uBD80\uC5C6\uC74C)",
];

let pool: Pool | undefined;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }

  return pool;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateToText(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function normalizeFilters(filters: Partial<FilterState>): FilterState {
  return {
    ...DEFAULT_FILTERS,
    ...filters,
  };
}

function buildWhere(filters: FilterState) {
  const clauses = ["s.trade_date = latest.latest_trade_date"];
  const values: unknown[] = [];

  if (filters.market !== ALL_MARKET) {
    values.push(filters.market);
    clauses.push(`s.market = $${values.length}`);
  }

  if (filters.sector !== ALL_MARKET) {
    values.push(filters.sector);
    clauses.push(`coalesce(c.sector_name, m.sector_name, $${values.length + 1}) = $${values.length}`);
    values.push(UNCATEGORIZED);
  }

  if (filters.query.trim()) {
    values.push(`%${filters.query.trim()}%`);
    clauses.push(`(m.name_kr ilike $${values.length} or m.ticker ilike $${values.length})`);
  }

  if (Number.isFinite(filters.minChangePct)) {
    values.push(filters.minChangePct / 100);
    clauses.push(`coalesce(s.change_rate, -999) >= $${values.length}`);
  }

  if (Number.isFinite(filters.minTradingValue) && filters.minTradingValue > 0) {
    values.push(filters.minTradingValue * 100000000);
    clauses.push(`coalesce(s.trading_value, 0) >= $${values.length}`);
  }

  if (filters.onlyCommonStock) {
    values.push(COMMON_STOCK);
    clauses.push(`m.security_type_name = $${values.length}`);
  }

  if (filters.excludeRiskSegments) {
    values.push(RISK_SEGMENTS);
    clauses.push(`not (coalesce(m.market_segment_name, '') = any($${values.length}))`);
  }

  return {
    whereSql: clauses.join(" and "),
    values,
  };
}

function buildOrderBy(sort: string | null) {
  switch (sort) {
    case "tradingValue":
      return "coalesce(s.trading_value, 0) desc";
    case "change":
      return "coalesce(s.change_rate, -999) desc";
    case "marketCap":
      return "coalesce(s.market_cap, 0) desc";
    case "momentum":
      return "coalesce(s.momentum_20d, -999) desc";
    default:
      return "score desc, coalesce(s.trading_value, 0) desc";
  }
}

export async function getStocks(filtersInput: Partial<FilterState> = {}, sort: string | null = "score") {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for stock data API.");
  }

  const filters = normalizeFilters(filtersInput);
  const { whereSql, values } = buildWhere(filters);
  const orderBy = buildOrderBy(sort);
  const client = await getPool().connect();

  try {
    const stocksQuery = await client.query(
      `
        with latest as (
          select max(trade_date) as latest_trade_date
          from stock_daily_snapshot
        ),
        recent_dates as (
          select trade_date
          from stock_daily_snapshot, latest
          where trade_date <= latest.latest_trade_date
          group by trade_date
          order by trade_date desc
          limit 20
        ),
        start_date as (
          select min(trade_date) as start_trade_date
          from recent_dates
        ),
        start_prices as (
          select s.ticker, s.close_price as start_close_price
          from stock_daily_snapshot s
          join start_date d on s.trade_date = d.start_trade_date
        ),
        latest_rows as (
          select
            s.*,
            percent_rank() over (order by coalesce(s.trading_value, 0) desc) * 100 as volume_rank_pct
          from stock_daily_snapshot s
          join latest on s.trade_date = latest.latest_trade_date
        ),
        enriched as (
          select
            s.*,
            m.name_kr,
            m.market_segment_name,
            m.security_type_name,
            coalesce(c.sector_name, m.sector_name, $${values.length + 1}) as sector_name,
            case
              when sp.start_close_price is null or sp.start_close_price = 0 then null
              else (s.close_price / sp.start_close_price - 1) * 100
            end as momentum_20d
          from latest_rows s
          join latest on true
          join stock_master m on m.ticker = s.ticker
          left join stock_industry_classification c on c.ticker = s.ticker and c.is_current = 1
          left join start_prices sp on sp.ticker = s.ticker
          where ${whereSql}
        ),
        scored as (
          select
            *,
            (
              coalesce(change_rate, 0) * 100 * 2
              + coalesce(momentum_20d, 0)
              + least(coalesce(trading_value, 0) / 10000000000.0, 25)
              + least(coalesce(market_cap, 0) / 1000000000000.0, 25)
            ) as score
          from enriched
        )
        select *
        from scored s
        order by ${orderBy}
        limit 300
      `,
      [...values, UNCATEGORIZED],
    );

    const sectorQuery = await client.query(
      `
        with latest as (
          select max(trade_date) as latest_trade_date
          from stock_daily_snapshot
        ),
        base as (
          select
            coalesce(c.sector_name, m.sector_name, $1) as sector_name,
            s.ticker,
            m.name_kr,
            s.change_rate,
            s.trading_value,
            s.market_cap,
            row_number() over (
              partition by coalesce(c.sector_name, m.sector_name, $1)
              order by coalesce(s.change_rate, -999) desc
            ) as leader_rank
          from stock_daily_snapshot s
          join latest on s.trade_date = latest.latest_trade_date
          join stock_master m on m.ticker = s.ticker
          left join stock_industry_classification c on c.ticker = s.ticker and c.is_current = 1
          where m.security_type_name = $2
            and not (coalesce(m.market_segment_name, '') = any($3))
        )
        select
          sector_name,
          count(*)::integer as stock_count,
          avg(change_rate) * 100 as average_change_pct,
          sum(trading_value) as trading_value,
          sum(market_cap) as market_cap_value,
          max(case when leader_rank = 1 then ticker end) as leader_ticker,
          max(case when leader_rank = 1 then name_kr end) as leader_name,
          max(case when leader_rank = 1 then change_rate end) * 100 as leader_change_pct
        from base
        group by sector_name
        order by average_change_pct desc nulls last, stock_count desc
        limit 80
      `,
      [UNCATEGORIZED, COMMON_STOCK, RISK_SEGMENTS],
    );

    const marketQuery = await client.query(
      `
        select trade_date, kospi_close, kospi_return_1d, kosdaq_close, kosdaq_return_1d,
               usdkrw_close, kr_10y_yield, us_10y_yield, wti_close, sp500_return_1d
        from market_daily_factors
        order by trade_date desc
        limit 1
      `,
    );

    const coverageQuery = await client.query(
      `
        with latest as (
          select max(trade_date) as latest_trade_date
          from stock_daily_snapshot
        )
        select
          latest.latest_trade_date,
          (select count(*)::integer from stock_daily_snapshot s where s.trade_date = latest.latest_trade_date) as stock_rows,
          (select count(*)::integer from stock_industry_classification where is_current = 1) as classified_rows,
          (
            select count(*)::integer
            from stock_master m
            left join stock_industry_classification c on c.ticker = m.ticker and c.is_current = 1
            where c.ticker is null
          ) as missing_classification_rows
        from latest
      `,
    );

    const stocks: Stock[] = stocksQuery.rows.map((row) => {
      const changePct = (toNumber(row.change_rate) ?? 0) * 100;
      const momentum20d = toNumber(row.momentum_20d);
      const tradingValue = toNumber(row.trading_value);
      const sectorName = String(row.sector_name);
      const segmentName = row.market_segment_name ? String(row.market_segment_name) : null;
      const securityTypeName = row.security_type_name ? String(row.security_type_name) : null;
      const reasons = [
        `Sector: ${sectorName}`,
        tradingValue ? `Trading value: ${Math.round(tradingValue / 100000000)}eok KRW` : "Trading value unavailable",
        momentum20d !== null ? `20 trading days: ${momentum20d >= 0 ? "+" : ""}${momentum20d.toFixed(1)}%` : "Momentum unavailable",
      ];
      const risks = [
        segmentName ? `Market segment: ${segmentName}` : "No market segment",
        securityTypeName ? `Security type: ${securityTypeName}` : "Security type unavailable",
      ];

      return {
        ticker: String(row.ticker),
        name: String(row.name_kr),
        market: String(row.market) as Stock["market"],
        sector: sectorName,
        price: toNumber(row.close_price) ?? 0,
        changePct,
        changePrice: toNumber(row.change_price),
        volume: toNumber(row.volume),
        tradingValue,
        marketCapValue: toNumber(row.market_cap),
        sharesOutstanding: toNumber(row.shares_outstanding),
        marketSegmentName: segmentName,
        securityTypeName,
        momentum20d,
        volumeRankPct: toNumber(row.volume_rank_pct),
        score: Math.round(toNumber(row.score) ?? 0),
        reasons,
        risks,
      };
    });

    const sectors = sectorQuery.rows.map((row) => ({
      sector: String(row.sector_name),
      stockCount: Number(row.stock_count),
      averageChangePct: toNumber(row.average_change_pct) ?? 0,
      tradingValue: toNumber(row.trading_value) ?? 0,
      marketCapValue: toNumber(row.market_cap_value) ?? 0,
      leaderTicker: row.leader_ticker ? String(row.leader_ticker) : null,
      leaderName: row.leader_name ? String(row.leader_name) : null,
      leaderChangePct: toNumber(row.leader_change_pct),
    }));

    const marketRow = marketQuery.rows[0];
    const coverageRow = coverageQuery.rows[0];

    return {
      stocks,
      sectors,
      marketFactors: marketRow
        ? {
            tradeDate: dateToText(marketRow.trade_date),
            kospiClose: toNumber(marketRow.kospi_close),
            kospiReturn1d: (toNumber(marketRow.kospi_return_1d) ?? 0) * 100,
            kosdaqClose: toNumber(marketRow.kosdaq_close),
            kosdaqReturn1d: (toNumber(marketRow.kosdaq_return_1d) ?? 0) * 100,
            usdkrwClose: toNumber(marketRow.usdkrw_close),
            kr10yYield: (toNumber(marketRow.kr_10y_yield) ?? 0) * 100,
            us10yYield: (toNumber(marketRow.us_10y_yield) ?? 0) * 100,
            wtiClose: toNumber(marketRow.wti_close),
            sp500Return1d: (toNumber(marketRow.sp500_return_1d) ?? 0) * 100,
          }
        : null,
      coverage: {
        latestTradeDate: dateToText(coverageRow?.latest_trade_date),
        stockRows: Number(coverageRow?.stock_rows ?? 0),
        classifiedRows: Number(coverageRow?.classified_rows ?? 0),
        missingClassificationRows: Number(coverageRow?.missing_classification_rows ?? 0),
      },
      source: "database" as const,
      updatedAt: new Date().toISOString(),
    } satisfies StocksApiResponse;
  } finally {
    client.release();
  }
}