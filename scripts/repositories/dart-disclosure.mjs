export async function upsertDartCorpCodeRows(client, rows) {
  for (const row of rows) {
    if (!row.corp_code) {
      continue;
    }

    await client.query(
      `
        insert into dart_corp_code_map (
          corp_code,
          ticker,
          corp_name,
          modify_date,
          is_active,
          collected_at
        )
        values ($1, $2, $3, $4, $5, current_timestamp)
        on conflict (corp_code) do update
        set ticker = excluded.ticker,
            corp_name = excluded.corp_name,
            modify_date = excluded.modify_date,
            is_active = excluded.is_active,
            collected_at = current_timestamp
      `,
      [row.corp_code, row.ticker, row.corp_name, row.modify_date, row.is_active ?? 1],
    );
  }
}

export async function upsertDartDisclosureEventRows(client, rows) {
  for (const row of rows) {
    if (!row.receipt_no || !row.corp_code || !row.report_name || !row.filed_date) {
      continue;
    }

    await client.query(
      `
        insert into dart_disclosure_event (
          receipt_no,
          ticker,
          corp_code,
          corp_name,
          report_name,
          filed_date,
          submitter_name,
          remark,
          disclosure_type_code,
          disclosure_type_name,
          disclosure_detail_code,
          disclosure_detail_name,
          event_category,
          is_final_report,
          collected_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, current_timestamp
        )
        on conflict (receipt_no) do update
        set ticker = excluded.ticker,
            corp_code = excluded.corp_code,
            corp_name = excluded.corp_name,
            report_name = excluded.report_name,
            filed_date = excluded.filed_date,
            submitter_name = excluded.submitter_name,
            remark = excluded.remark,
            disclosure_type_code = excluded.disclosure_type_code,
            disclosure_type_name = excluded.disclosure_type_name,
            disclosure_detail_code = excluded.disclosure_detail_code,
            disclosure_detail_name = excluded.disclosure_detail_name,
            event_category = excluded.event_category,
            is_final_report = excluded.is_final_report,
            collected_at = current_timestamp
      `,
      [
        row.receipt_no,
        row.ticker,
        row.corp_code,
        row.corp_name,
        row.report_name,
        row.filed_date,
        row.submitter_name,
        row.remark,
        row.disclosure_type_code,
        row.disclosure_type_name,
        row.disclosure_detail_code,
        row.disclosure_detail_name,
        row.event_category,
        row.is_final_report ?? 0,
      ],
    );
  }
}

export async function rebuildStockDisclosureDaily(client) {
  await client.query("truncate table stock_disclosure_daily");
  await client.query(`
    insert into stock_disclosure_daily (
      trade_date,
      ticker,
      corp_code,
      total_disclosure_count,
      periodic_disclosure_count,
      major_issue_disclosure_count,
      issuance_disclosure_count,
      equity_disclosure_count,
      other_disclosure_count,
      is_earnings_disclosure_day,
      is_capital_raise_disclosure_day,
      is_order_contract_disclosure_day,
      is_major_corporate_action_day,
      created_at
    )
    select
      filed_date as trade_date,
      ticker,
      max(corp_code) as corp_code,
      count(*)::integer as total_disclosure_count,
      count(*) filter (where disclosure_type_code = 'A')::integer as periodic_disclosure_count,
      count(*) filter (where disclosure_type_code = 'B')::integer as major_issue_disclosure_count,
      count(*) filter (where disclosure_type_code = 'C')::integer as issuance_disclosure_count,
      count(*) filter (where disclosure_type_code = 'D')::integer as equity_disclosure_count,
      count(*) filter (where disclosure_type_code = 'E')::integer as other_disclosure_count,
      max(case when event_category = 'earnings' then 1 else 0 end)::smallint as is_earnings_disclosure_day,
      max(case when event_category = 'capital_raise' then 1 else 0 end)::smallint as is_capital_raise_disclosure_day,
      max(case when event_category = 'order_contract' then 1 else 0 end)::smallint as is_order_contract_disclosure_day,
      max(case when event_category = 'major_corporate_action' then 1 else 0 end)::smallint as is_major_corporate_action_day,
      current_timestamp
    from dart_disclosure_event
    where ticker is not null
      and ticker <> ''
    group by filed_date, ticker
  `);
}
