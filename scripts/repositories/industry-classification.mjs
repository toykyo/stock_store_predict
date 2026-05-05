export async function upsertIndustryClassificationRows(client, rows) {
  let insertedOrUpdated = 0;
  let skippedMissingMaster = 0;

  for (const row of rows) {
    const exists = await client.query(
      "select 1 from stock_master where ticker = $1 limit 1",
      [row.ticker],
    );

    if (exists.rowCount === 0) {
      skippedMissingMaster += 1;
      continue;
    }

    await client.query(
      `
        update stock_industry_classification
        set is_current = 0,
            effective_to = $3::date - interval '1 day'
        where ticker = $1
          and source = $2
          and is_current = 1
          and effective_from <> $3::date
      `,
      [row.ticker, row.source, row.effective_from],
    );

    await client.query(
      `
        insert into stock_industry_classification (
          ticker, market, name_kr, sector_code, sector_name, industry_code,
          industry_name, source, effective_from, effective_to, is_current,
          collected_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, 1, current_timestamp)
        on conflict (ticker, source, effective_from) do update
        set market = excluded.market,
            name_kr = excluded.name_kr,
            sector_code = excluded.sector_code,
            sector_name = excluded.sector_name,
            industry_code = excluded.industry_code,
            industry_name = excluded.industry_name,
            effective_to = null,
            is_current = 1,
            collected_at = current_timestamp
      `,
      [
        row.ticker,
        row.market,
        row.name_kr,
        row.sector_code,
        row.sector_name,
        row.industry_code,
        row.industry_name,
        row.source,
        row.effective_from,
      ],
    );

    await client.query(
      `
        update stock_master
        set sector_code = $2,
            sector_name = $3,
            updated_at = current_timestamp
        where ticker = $1
      `,
      [row.ticker, row.sector_code, row.sector_name],
    );

    insertedOrUpdated += 1;
  }

  return { insertedOrUpdated, skippedMissingMaster };
}

export async function getIndustryClassificationStatus(client, staleAfterDays = 30) {
  const summary = await client.query(
    `
      select
        count(*)::integer as classification_count,
        max(collected_at) as last_collected_at,
        case
          when max(collected_at) is null then null
          else floor(extract(epoch from current_timestamp - max(collected_at)) / 86400)::integer
        end as age_days
      from stock_industry_classification
      where is_current = 1
    `,
  );

  const missing = await client.query(
    `
      select count(*)::integer as missing_count
      from stock_master m
      left join stock_industry_classification c
        on c.ticker = m.ticker
       and c.is_current = 1
      where c.ticker is null
    `,
  );

  const row = summary.rows[0] ?? {};
  const ageDays = row.age_days === null || row.age_days === undefined ? null : Number(row.age_days);
  const missingCount = Number(missing.rows[0]?.missing_count ?? 0);

  return {
    classificationCount: Number(row.classification_count ?? 0),
    lastCollectedAt: row.last_collected_at ?? null,
    ageDays,
    missingCount,
    staleAfterDays,
    isStale: ageDays === null || ageDays >= staleAfterDays,
    hasMissing: missingCount > 0,
  };
}