function normalizePayload(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

export async function upsertMarketDailyFactors(client, payload) {
  const record = normalizePayload(payload);
  const columns = Object.keys(record);
  const values = Object.values(record);

  if (columns.length === 0) {
    throw new Error("No columns provided for market_daily_factors upsert.");
  }

  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updates = columns
    .filter((column) => column !== "trade_date")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  await client.query(
    `
      insert into market_daily_factors (${columns.join(", ")})
      values (${placeholders})
      on conflict (trade_date) do update
      set ${updates}
    `,
    values,
  );
}

export async function upsertStockMasterRows(client, rows) {
  for (const row of rows) {
    await client.query(
      `
        insert into stock_master (
          ticker, isin, market, name_kr, name_en, corp_name, security_group_name,
          market_segment_name, security_type_name, listing_date, par_value,
          shares_outstanding, status, updated_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, current_timestamp
        )
        on conflict (ticker) do update
        set isin = excluded.isin,
            market = excluded.market,
            name_kr = excluded.name_kr,
            name_en = excluded.name_en,
            corp_name = excluded.corp_name,
            security_group_name = excluded.security_group_name,
            market_segment_name = excluded.market_segment_name,
            security_type_name = excluded.security_type_name,
            listing_date = excluded.listing_date,
            par_value = excluded.par_value,
            shares_outstanding = excluded.shares_outstanding,
            status = excluded.status,
            updated_at = current_timestamp
      `,
      [
        row.ticker,
        row.isin,
        row.market,
        row.name_kr,
        row.name_en,
        row.corp_name,
        row.security_group_name,
        row.market_segment_name,
        row.security_type_name,
        row.listing_date,
        row.par_value,
        row.shares_outstanding,
        row.status,
      ],
    );
  }
}

export async function upsertStockDailySnapshotRows(client, rows) {
  for (const row of rows) {
    await client.query(
      `
        insert into stock_daily_snapshot (
          trade_date, ticker, market, name_kr, market_segment_name, open_price, high_price,
          low_price, close_price, change_price, change_rate, volume, trading_value,
          market_cap, shares_outstanding, collected_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16
        )
        on conflict (trade_date, ticker) do update
        set market = excluded.market,
            name_kr = excluded.name_kr,
            market_segment_name = excluded.market_segment_name,
            open_price = excluded.open_price,
            high_price = excluded.high_price,
            low_price = excluded.low_price,
            close_price = excluded.close_price,
            change_price = excluded.change_price,
            change_rate = excluded.change_rate,
            volume = excluded.volume,
            trading_value = excluded.trading_value,
            market_cap = excluded.market_cap,
            shares_outstanding = excluded.shares_outstanding,
            collected_at = excluded.collected_at
      `,
      [
        row.trade_date,
        row.ticker,
        row.market,
        row.name_kr,
        row.market_segment_name,
        row.open_price,
        row.high_price,
        row.low_price,
        row.close_price,
        row.change_price,
        row.change_rate,
        row.volume,
        row.trading_value,
        row.market_cap,
        row.shares_outstanding,
        row.collected_at,
      ],
    );
  }
}
