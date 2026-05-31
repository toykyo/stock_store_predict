function toDateText(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

const STOCK_MODEL_SEGMENT_EXCLUSION_SQL = `
  and coalesce(m.market_segment_name, '') not like '%SPAC%'
  and coalesce(m.market_segment_name, '') not like '%관리종목%'
  and coalesce(m.market_segment_name, '') not like '%투자주의환기종목%'
  and coalesce(m.market_segment_name, '') not like '%외국기업%'
`;

const STOCK_MODEL_QUANT_FILTER_SQL = `
  and coalesce(f.avg_trading_value_20d, 0) >= 500000000
  and coalesce(f.market_cap, 0) >= 30000000000
  and coalesce(f.close_price, 0) >= 1000
  and coalesce(f.trading_day_coverage_60d, 0) >= 0.8
`;

export async function rebuildSectorDailySnapshot(client) {
  await client.query("truncate table sector_daily_snapshot");
  await client.query(`
    insert into sector_daily_snapshot (
      trade_date,
      market,
      sector_code,
      sector_name,
      stock_count,
      advancers_count,
      decliners_count,
      flat_count,
      sector_return_1d,
      sector_trading_value,
      sector_market_cap,
      sector_avg_change_rate,
      sector_median_change_rate,
      sector_breadth_ratio,
      top_stock_ticker,
      top_stock_name,
      collected_at
    )
    with classified as (
      select
        s.trade_date,
        s.market,
        s.ticker,
        s.name_kr,
        concat(case when s.market = 'KOSPI' then 'P' else 'D' end, '_', coalesce(nullif(c.sector_code, ''), substr(md5(coalesce(nullif(c.sector_name, ''), '미분류')), 1, 17))) as sector_code,
        coalesce(nullif(c.sector_name, ''), '미분류') as sector_name,
        s.change_rate,
        s.trading_value,
        s.market_cap,
        row_number() over (
          partition by s.trade_date, concat(case when s.market = 'KOSPI' then 'P' else 'D' end, '_', coalesce(nullif(c.sector_code, ''), substr(md5(coalesce(nullif(c.sector_name, ''), '미분류')), 1, 17)))
          order by coalesce(s.change_rate, -9) desc, coalesce(s.trading_value, 0) desc, s.ticker
        ) as leader_rank
      from stock_daily_snapshot s
      join stock_industry_classification c
        on c.ticker = s.ticker
       and c.is_current = 1
    )
    select
      trade_date,
      market,
      sector_code,
      sector_name,
      count(*)::integer as stock_count,
      count(*) filter (where change_rate > 0)::integer as advancers_count,
      count(*) filter (where change_rate < 0)::integer as decliners_count,
      count(*) filter (where coalesce(change_rate, 0) = 0)::integer as flat_count,
      case
        when coalesce(sum(market_cap), 0) > 0 then sum(change_rate * market_cap) / sum(market_cap)
        else avg(change_rate)
      end as sector_return_1d,
      sum(trading_value)::bigint as sector_trading_value,
      sum(market_cap)::bigint as sector_market_cap,
      avg(change_rate) as sector_avg_change_rate,
      percentile_cont(0.5) within group (order by change_rate) as sector_median_change_rate,
      count(*) filter (where change_rate > 0)::numeric / nullif(count(*), 0) as sector_breadth_ratio,
      max(case when leader_rank = 1 then ticker end) as top_stock_ticker,
      max(case when leader_rank = 1 then name_kr end) as top_stock_name,
      current_timestamp
    from classified
    group by trade_date, market, sector_code, sector_name
  `);
}

export async function rebuildFeatureAndTargetTables(client) {
  await client.query("truncate table sector_feature_daily, sector_target_daily, stock_feature_daily, stock_target_daily");

  await client.query(`
    insert into sector_feature_daily (
      trade_date,
      market,
      sector_code,
      sector_name,
      sector_return_1d,
      sector_return_5d,
      sector_return_20d,
      sector_volatility_20d,
      sector_breadth_ratio,
      sector_trading_value_ratio_5d,
      sector_market_cap,
      sector_excess_vs_market_1d,
      kospi_return_1d,
      kosdaq_return_1d,
      kosdaq_excess_return_vs_kospi,
      usdkrw_return_1d,
      dxy_close,
      kr_10y_yield,
      kr_3y_yield,
      kr_10y_change_5d,
      kr_term_spread_10y_3y,
      us_10y_yield,
      us_2y_yield,
      us_10y_change_5d,
      us_term_spread_10y_2y,
      wti_return_5d,
        brent_return_5d,
        nasdaq_return_1d,
        sox_return_1d,
        sp500_return_1d,
        vix_close,
        vix_return_1d,
        sox_return_1d_x_semiconductor,
        nasdaq_return_1d_x_semiconductor,
        usdkrw_return_1d_x_export_electronics,
        wti_return_5d_x_chemical,
        brent_return_5d_x_chemical,
        kr_term_spread_10y_3y_x_financial,
        kr_3y_yield_x_financial,
        nasdaq_return_1d_x_biotech,
        us_2y_yield_x_biotech,
        kr_3y_yield_x_construction,
        kosdaq_excess_return_vs_kospi_x_content,
        is_month_end,
        is_quarter_end,
        is_holiday_before,
        is_holiday_after,
        created_at
    )
    with market_window as (
      select
        m.*,
        lag(m.kr_10y_yield, 5) over (order by m.trade_date) as kr_10y_yield_lag5,
        lag(m.kr_3y_yield, 5) over (order by m.trade_date) as kr_3y_yield_lag5,
        lag(m.us_10y_yield, 5) over (order by m.trade_date) as us_10y_yield_lag5,
        lag(m.us_2y_yield, 5) over (order by m.trade_date) as us_2y_yield_lag5,
        lag(m.wti_close, 5) over (order by m.trade_date) as wti_close_lag5,
        lag(m.brent_close, 5) over (order by m.trade_date) as brent_close_lag5
      from market_daily_factors m
    ),
    sector_window as (
      select
        s.*,
        lag(s.sector_return_1d, 5) over (partition by s.sector_code order by s.trade_date) as sector_return_1d_lag5,
        lag(s.sector_return_1d, 20) over (partition by s.sector_code order by s.trade_date) as sector_return_1d_lag20,
        lag(s.sector_trading_value, 5) over (partition by s.sector_code order by s.trade_date) as sector_trading_value_lag5,
        stddev_pop(s.sector_return_1d) over (
          partition by s.sector_code
          order by s.trade_date
          rows between 19 preceding and current row
        ) as sector_volatility_20d
      from sector_daily_snapshot s
    )
    select
      s.trade_date,
      s.market,
      s.sector_code,
      s.sector_name,
      s.sector_return_1d,
      case
        when s.sector_return_1d_lag5 is null then null
        else (
          exp(sum(ln(1 + coalesce(s.sector_return_1d, 0))) over (
            partition by s.sector_code
            order by s.trade_date
            rows between 4 preceding and current row
          )) - 1
        )
      end as sector_return_5d,
      case
        when s.sector_return_1d_lag20 is null then null
        else (
          exp(sum(ln(1 + coalesce(s.sector_return_1d, 0))) over (
            partition by s.sector_code
            order by s.trade_date
            rows between 19 preceding and current row
          )) - 1
        )
      end as sector_return_20d,
      s.sector_volatility_20d,
      s.sector_breadth_ratio,
      case
        when coalesce(s.sector_trading_value_lag5, 0) = 0 then null
        else s.sector_trading_value::numeric / s.sector_trading_value_lag5
      end as sector_trading_value_ratio_5d,
      s.sector_market_cap,
      s.sector_return_1d - case when s.market = 'KOSPI' then m.kospi_return_1d else m.kosdaq_return_1d end as sector_excess_vs_market_1d,
      m.kospi_return_1d,
      m.kosdaq_return_1d,
      m.kosdaq_excess_return_vs_kospi,
      m.usdkrw_return_1d,
      m.dxy_close,
      m.kr_10y_yield,
      m.kr_3y_yield,
      case when m.kr_10y_yield_lag5 is null then null else m.kr_10y_yield - m.kr_10y_yield_lag5 end as kr_10y_change_5d,
      case
        when m.kr_10y_yield is null or m.kr_3y_yield is null then null
        else m.kr_10y_yield - m.kr_3y_yield
      end as kr_term_spread_10y_3y,
      m.us_10y_yield,
      m.us_2y_yield,
      case when m.us_10y_yield_lag5 is null then null else m.us_10y_yield - m.us_10y_yield_lag5 end as us_10y_change_5d,
      case
        when m.us_10y_yield is null or m.us_2y_yield is null then null
        else m.us_10y_yield - m.us_2y_yield
      end as us_term_spread_10y_2y,
      case when coalesce(m.wti_close_lag5, 0) = 0 then null else m.wti_close / m.wti_close_lag5 - 1 end as wti_return_5d,
        case when coalesce(m.brent_close_lag5, 0) = 0 then null else m.brent_close / m.brent_close_lag5 - 1 end as brent_return_5d,
        m.nasdaq_return_1d,
        m.sox_return_1d,
        m.sp500_return_1d,
        m.vix_close,
        m.vix_return_1d,
        case
          when (
            s.sector_name like '%반도체%' or
            s.sector_name like '%전자부품%' or
            s.sector_name like '%전자집적회로%' or
            s.sector_name like '%통신 및 방송 장비%' or
            s.sector_name like '%컴퓨터 및 주변장치%' or
            s.sector_name like '%전동기, 발전기 및 전기 변환%' or
            s.sector_name like '%절연선 및 케이블%'
          ) then m.sox_return_1d
          else 0
        end as sox_return_1d_x_semiconductor,
        case
          when (
            s.sector_name like '%반도체%' or
            s.sector_name like '%전자부품%' or
            s.sector_name like '%전자집적회로%' or
            s.sector_name like '%통신 및 방송 장비%' or
            s.sector_name like '%컴퓨터 및 주변장치%' or
            s.sector_name like '%전동기, 발전기 및 전기 변환%' or
            s.sector_name like '%절연선 및 케이블%'
          ) then m.nasdaq_return_1d
          else 0
        end as nasdaq_return_1d_x_semiconductor,
        case
          when (
            s.sector_name like '%반도체%' or
            s.sector_name like '%전자부품%' or
            s.sector_name like '%전자집적회로%' or
            s.sector_name like '%통신 및 방송 장비%' or
            s.sector_name like '%컴퓨터 및 주변장치%' or
            s.sector_name like '%전동기, 발전기 및 전기 변환%' or
            s.sector_name like '%절연선 및 케이블%'
          ) then m.usdkrw_return_1d
          else 0
        end as usdkrw_return_1d_x_export_electronics,
        case
          when (
            s.sector_name like '%화학%' or
            s.sector_name like '%고무제품%' or
            s.sector_name like '%유리 및 유리제품%' or
            s.sector_name like '%시멘트%' or
            s.sector_name like '%도료%' or
            s.sector_name like '%비료%' or
            s.sector_name like '%농약%' or
            s.sector_name like '%플라스틱%'
          ) then case when coalesce(m.wti_close_lag5, 0) = 0 then null else m.wti_close / m.wti_close_lag5 - 1 end
          else 0
        end as wti_return_5d_x_chemical,
        case
          when (
            s.sector_name like '%화학%' or
            s.sector_name like '%고무제품%' or
            s.sector_name like '%유리 및 유리제품%' or
            s.sector_name like '%시멘트%' or
            s.sector_name like '%도료%' or
            s.sector_name like '%비료%' or
            s.sector_name like '%농약%' or
            s.sector_name like '%플라스틱%'
          ) then case when coalesce(m.brent_close_lag5, 0) = 0 then null else m.brent_close / m.brent_close_lag5 - 1 end
          else 0
        end as brent_return_5d_x_chemical,
        case
          when (
            s.sector_name like '%금융%' or
            s.sector_name like '%보험작%' or
            s.sector_name like '%은행%' or
            s.sector_name like '%증권%' or
            s.sector_name like '%연금%'
          ) and m.kr_10y_yield is not null and m.kr_3y_yield is not null
          then m.kr_10y_yield - m.kr_3y_yield
          else 0
        end as kr_term_spread_10y_3y_x_financial,
        case
          when (
            s.sector_name like '%금융%' or
            s.sector_name like '%보험%' or
            s.sector_name like '%은행%' or
            s.sector_name like '%증권%' or
            s.sector_name like '%연금%'
          ) then coalesce(m.kr_3y_yield, 0)
          else 0
        end as kr_3y_yield_x_financial,
        case
          when (
            s.sector_name like '%의약품%' or
            s.sector_name like '%의료용%' or
            s.sector_name like '%연구개발업%'
          ) then m.nasdaq_return_1d
          else 0
        end as nasdaq_return_1d_x_biotech,
        case
          when (
            s.sector_name like '%의약품%' or
            s.sector_name like '%의료용%' or
            s.sector_name like '%연구개발업%'
          ) then coalesce(m.us_2y_yield, 0)
          else 0
        end as us_2y_yield_x_biotech,
        case
          when (
            s.sector_name like '%건설업%' or
            s.sector_name like '%공사업%' or
            s.sector_name like '%부동산%'
          ) then coalesce(m.kr_3y_yield, 0)
          else 0
        end as kr_3y_yield_x_construction,
        case
          when (
            s.sector_name like '%소프트웨어%' or
            s.sector_name like '%영화%' or
            s.sector_name like '%방송프로그램%' or
            s.sector_name like '%정보서비스업%' or
            s.sector_name like '%출판업%'
          ) then m.kosdaq_excess_return_vs_kospi
          else 0
        end as kosdaq_excess_return_vs_kospi_x_content,
        m.is_month_end,
        m.is_quarter_end,
        m.is_holiday_before,
        m.is_holiday_after,
        current_timestamp
    from sector_window s
    join market_window m on m.trade_date = s.trade_date
  `);

  await client.query(`
    insert into sector_target_daily (
      trade_date,
      market,
      sector_code,
      sector_name,
      sector_return_5d_fwd,
      market_return_5d_fwd,
      sector_excess_return_5d_fwd,
      is_excess_vs_market_5d_fwd,
      created_at
    )
    with sector_nav as (
      select
        s.*,
        exp(sum(ln(1 + coalesce(s.sector_return_1d, 0))) over (
          partition by s.sector_code
          order by s.trade_date
          rows between unbounded preceding and current row
        )) as sector_nav
      from sector_daily_snapshot s
    ),
    market_window as (
      select
        trade_date,
        kospi_close,
        kosdaq_close,
        lead(kospi_close, 5) over (order by trade_date) as kospi_close_lead5,
        lead(kosdaq_close, 5) over (order by trade_date) as kosdaq_close_lead5
      from market_daily_factors
    )
    select
      s.trade_date,
      s.market,
      s.sector_code,
      s.sector_name,
      case when lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) is null or s.sector_nav = 0 then null
        else lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) / s.sector_nav - 1
      end as sector_return_5d_fwd,
      case
        when s.market = 'KOSPI' and coalesce(m.kospi_close, 0) <> 0 and m.kospi_close_lead5 is not null then m.kospi_close_lead5 / m.kospi_close - 1
        when s.market = 'KOSDAQ' and coalesce(m.kosdaq_close, 0) <> 0 and m.kosdaq_close_lead5 is not null then m.kosdaq_close_lead5 / m.kosdaq_close - 1
        else null
      end as market_return_5d_fwd,
      case
        when (
          case when lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) is null or s.sector_nav = 0 then null
            else lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) / s.sector_nav - 1
          end
        ) is null then null
        else (
          case when lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) is null or s.sector_nav = 0 then null
            else lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) / s.sector_nav - 1
          end
        ) - (
          case
            when s.market = 'KOSPI' and coalesce(m.kospi_close, 0) <> 0 and m.kospi_close_lead5 is not null then m.kospi_close_lead5 / m.kospi_close - 1
            when s.market = 'KOSDAQ' and coalesce(m.kosdaq_close, 0) <> 0 and m.kosdaq_close_lead5 is not null then m.kosdaq_close_lead5 / m.kosdaq_close - 1
            else null
          end
        )
      end as sector_excess_return_5d_fwd,
      case
        when (
          case when lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) is null or s.sector_nav = 0 then null
            else lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) / s.sector_nav - 1
          end
        ) is null then null
        when (
          (
            case when lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) is null or s.sector_nav = 0 then null
              else lead(s.sector_nav, 5) over (partition by s.sector_code order by s.trade_date) / s.sector_nav - 1
            end
          ) - (
            case
              when s.market = 'KOSPI' and coalesce(m.kospi_close, 0) <> 0 and m.kospi_close_lead5 is not null then m.kospi_close_lead5 / m.kospi_close - 1
              when s.market = 'KOSDAQ' and coalesce(m.kosdaq_close, 0) <> 0 and m.kosdaq_close_lead5 is not null then m.kosdaq_close_lead5 / m.kosdaq_close - 1
              else null
            end
          )
        ) > 0 then 1
        else 0
      end as is_excess_vs_market_5d_fwd,
      current_timestamp
    from sector_nav s
    join market_window m on m.trade_date = s.trade_date
  `);

  await client.query(`
    insert into stock_feature_daily (
      trade_date,
      ticker,
      market,
      sector_code,
      sector_name,
      close_price,
      stock_return_1d,
      stock_return_5d,
      stock_return_20d,
      stock_volatility_20d,
      trading_value_ratio_5d,
      avg_trading_value_20d,
      trading_day_coverage_60d,
      market_cap_log,
      stock_turnover_ratio,
      relative_volume_5d,
      relative_volume_20d,
      price_vs_ma20,
      price_vs_ma60,
      price_distance_from_20d_high,
      price_distance_from_60d_high,
      relative_strength_vs_sector_20d,
      stock_rank_in_sector_by_return_5d,
      total_disclosure_count_1d,
      periodic_disclosure_count_1d,
      major_issue_disclosure_count_1d,
      issuance_disclosure_count_1d,
      equity_disclosure_count_1d,
      other_disclosure_count_1d,
      is_earnings_disclosure_day,
      is_capital_raise_disclosure_day,
      is_order_contract_disclosure_day,
      is_major_corporate_action_day,
      market_cap,
      sector_return_1d,
      sector_return_5d,
      sector_breadth_ratio,
      excess_vs_sector_1d,
      excess_vs_sector_5d,
      kospi_return_1d,
      kosdaq_return_1d,
      kosdaq_excess_return_vs_kospi,
      usdkrw_return_1d,
      dxy_close,
      kr_10y_yield,
      kr_3y_yield,
      us_10y_yield,
      us_2y_yield,
      wti_return_5d,
      brent_return_5d,
      nasdaq_return_1d,
      sox_return_1d,
      sp500_return_1d,
      vix_close,
      vix_return_1d,
      is_month_end,
      is_quarter_end,
      created_at
    )
    with stock_window as (
      select
        s.*,
        lag(s.close_price, 5) over (partition by s.ticker order by s.trade_date) as close_lag5,
        lag(s.close_price, 20) over (partition by s.ticker order by s.trade_date) as close_lag20,
        lag(s.trading_value, 5) over (partition by s.ticker order by s.trade_date) as trading_value_lag5,
        avg(s.volume) over (
          partition by s.ticker
          order by s.trade_date
          rows between 4 preceding and current row
        ) as volume_avg_5d,
          avg(s.volume) over (
            partition by s.ticker
            order by s.trade_date
            rows between 19 preceding and current row
          ) as volume_avg_20d,
          avg(s.trading_value) over (
            partition by s.ticker
            order by s.trade_date
            rows between 19 preceding and current row
          ) as trading_value_avg_20d,
          count(*) over (
            partition by s.ticker
            order by s.trade_date
            rows between 59 preceding and current row
          )::numeric / 60 as trading_day_coverage_60d,
          avg(s.close_price) over (
            partition by s.ticker
            order by s.trade_date
            rows between 19 preceding and current row
          ) as close_ma20,
        avg(s.close_price) over (
          partition by s.ticker
          order by s.trade_date
          rows between 59 preceding and current row
        ) as close_ma60,
        max(s.high_price) over (
          partition by s.ticker
          order by s.trade_date
          rows between 19 preceding and current row
        ) as high_max_20d,
        max(s.high_price) over (
          partition by s.ticker
          order by s.trade_date
          rows between 59 preceding and current row
        ) as high_max_60d,
        stddev_pop(s.change_rate) over (
          partition by s.ticker
          order by s.trade_date
          rows between 19 preceding and current row
        ) as stock_volatility_20d
      from stock_daily_snapshot s
    )
    select
      s.trade_date,
      s.ticker,
      s.market,
      sf.sector_code,
      sf.sector_name,
      s.close_price,
        s.change_rate as stock_return_1d,
        case when coalesce(s.close_lag5, 0) = 0 then null else s.close_price / s.close_lag5 - 1 end as stock_return_5d,
        case when coalesce(s.close_lag20, 0) = 0 then null else s.close_price / s.close_lag20 - 1 end as stock_return_20d,
        s.stock_volatility_20d,
        case when coalesce(s.trading_value_lag5, 0) = 0 then null else s.trading_value::numeric / s.trading_value_lag5 end as trading_value_ratio_5d,
        s.trading_value_avg_20d as avg_trading_value_20d,
        s.trading_day_coverage_60d,
        case when coalesce(s.market_cap, 0) > 0 then ln(s.market_cap::numeric) else null end as market_cap_log,
        case when coalesce(s.shares_outstanding, 0) > 0 then s.volume::numeric / s.shares_outstanding else null end as stock_turnover_ratio,
        case when coalesce(s.volume_avg_5d, 0) = 0 then null else s.volume::numeric / s.volume_avg_5d end as relative_volume_5d,
        case when coalesce(s.volume_avg_20d, 0) = 0 then null else s.volume::numeric / s.volume_avg_20d end as relative_volume_20d,
      case when coalesce(s.close_ma20, 0) = 0 then null else s.close_price / s.close_ma20 - 1 end as price_vs_ma20,
      case when coalesce(s.close_ma60, 0) = 0 then null else s.close_price / s.close_ma60 - 1 end as price_vs_ma60,
      case when coalesce(s.high_max_20d, 0) = 0 then null else s.close_price / s.high_max_20d - 1 end as price_distance_from_20d_high,
      case when coalesce(s.high_max_60d, 0) = 0 then null else s.close_price / s.high_max_60d - 1 end as price_distance_from_60d_high,
      case
        when coalesce(s.close_lag20, 0) = 0 or sf.sector_return_20d is null then null
        else (s.close_price / s.close_lag20 - 1) - sf.sector_return_20d
      end as relative_strength_vs_sector_20d,
      case
        when coalesce(s.close_lag5, 0) = 0 then null
        when count(*) over (partition by s.trade_date, sf.sector_code) = 1 then 1
        else 1 - percent_rank() over (
          partition by s.trade_date, sf.sector_code
          order by (s.close_price / s.close_lag5 - 1) desc nulls last
        )
      end as stock_rank_in_sector_by_return_5d,
      coalesce(sd.total_disclosure_count, 0) as total_disclosure_count_1d,
      coalesce(sd.periodic_disclosure_count, 0) as periodic_disclosure_count_1d,
      coalesce(sd.major_issue_disclosure_count, 0) as major_issue_disclosure_count_1d,
      coalesce(sd.issuance_disclosure_count, 0) as issuance_disclosure_count_1d,
      coalesce(sd.equity_disclosure_count, 0) as equity_disclosure_count_1d,
      coalesce(sd.other_disclosure_count, 0) as other_disclosure_count_1d,
      coalesce(sd.is_earnings_disclosure_day, 0) as is_earnings_disclosure_day,
      coalesce(sd.is_capital_raise_disclosure_day, 0) as is_capital_raise_disclosure_day,
      coalesce(sd.is_order_contract_disclosure_day, 0) as is_order_contract_disclosure_day,
      coalesce(sd.is_major_corporate_action_day, 0) as is_major_corporate_action_day,
      s.market_cap,
      sf.sector_return_1d,
      sf.sector_return_5d,
      sf.sector_breadth_ratio,
      s.change_rate - sf.sector_return_1d as excess_vs_sector_1d,
      case
        when coalesce(s.close_lag5, 0) = 0 or sf.sector_return_5d is null then null
        else (s.close_price / s.close_lag5 - 1) - sf.sector_return_5d
      end as excess_vs_sector_5d,
      sf.kospi_return_1d,
      sf.kosdaq_return_1d,
      sf.kosdaq_excess_return_vs_kospi,
      sf.usdkrw_return_1d,
      sf.dxy_close,
      sf.kr_10y_yield,
      sf.kr_3y_yield,
      sf.us_10y_yield,
      sf.us_2y_yield,
      sf.wti_return_5d,
      sf.brent_return_5d,
      sf.nasdaq_return_1d,
      sf.sox_return_1d,
      sf.sp500_return_1d,
      sf.vix_close,
      sf.vix_return_1d,
      sf.is_month_end,
      sf.is_quarter_end,
      current_timestamp
    from stock_window s
    join stock_industry_classification c
      on c.ticker = s.ticker
     and c.is_current = 1
    join sector_feature_daily sf
      on sf.trade_date = s.trade_date
     and sf.sector_code = concat(case when s.market = 'KOSPI' then 'P' else 'D' end, '_', coalesce(nullif(c.sector_code, ''), substr(md5(coalesce(nullif(c.sector_name, ''), '미분류')), 1, 17)))
    left join stock_disclosure_daily sd
      on sd.trade_date = s.trade_date
     and sd.ticker = s.ticker
  `);

  await client.query(`
    insert into stock_target_daily (
      trade_date,
      ticker,
      market,
      sector_code,
      sector_name,
      stock_return_5d_fwd,
      sector_return_5d_fwd,
      stock_excess_return_5d_fwd,
      is_excess_vs_sector_5d_fwd,
      created_at
    )
    select
      s.trade_date,
      s.ticker,
      s.market,
      c.sector_code,
      c.sector_name,
      case when lead(s.close_price, 5) over (partition by s.ticker order by s.trade_date) is null or coalesce(s.close_price, 0) = 0 then null
        else lead(s.close_price, 5) over (partition by s.ticker order by s.trade_date) / s.close_price - 1
      end as stock_return_5d_fwd,
      st.sector_return_5d_fwd,
      case
        when st.sector_return_5d_fwd is null or lead(s.close_price, 5) over (partition by s.ticker order by s.trade_date) is null or coalesce(s.close_price, 0) = 0 then null
        else (lead(s.close_price, 5) over (partition by s.ticker order by s.trade_date) / s.close_price - 1) - st.sector_return_5d_fwd
      end as stock_excess_return_5d_fwd,
      case
        when st.sector_return_5d_fwd is null or lead(s.close_price, 5) over (partition by s.ticker order by s.trade_date) is null or coalesce(s.close_price, 0) = 0 then null
        when ((lead(s.close_price, 5) over (partition by s.ticker order by s.trade_date) / s.close_price - 1) - st.sector_return_5d_fwd) > 0 then 1
        else 0
      end as is_excess_vs_sector_5d_fwd,
      current_timestamp
    from stock_daily_snapshot s
    join stock_industry_classification c
      on c.ticker = s.ticker
     and c.is_current = 1
    join sector_target_daily st
      on st.trade_date = s.trade_date
     and st.sector_code = concat(case when s.market = 'KOSPI' then 'P' else 'D' end, '_', coalesce(nullif(c.sector_code, ''), substr(md5(coalesce(nullif(c.sector_name, ''), '미분류')), 1, 17)))
  `);
}

export async function saveModelRegistry(client, model) {
  if (model.status === "active") {
    await client.query(
      `
        update model_registry
        set status = 'archived'
        where model_type = $1
          and status = 'active'
      `,
      [model.model_type],
    );
  }

  await client.query(
    `
      insert into model_registry (
        model_version,
        model_type,
        feature_version,
        horizon_days,
        trained_from,
        trained_to,
        status,
        created_at,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, current_timestamp, $8::jsonb)
      on conflict (model_version) do update
      set status = excluded.status,
          metadata = excluded.metadata
    `,
    [
      model.model_version,
      model.model_type,
      model.feature_version,
      model.horizon_days,
      model.trained_from,
      model.trained_to,
      model.status,
      JSON.stringify(model.metadata),
    ],
  );
}

export async function saveTrainingRun(client, run) {
  await client.query(
    `
      insert into model_training_run (
        training_run_id,
        model_version,
        started_at,
        finished_at,
        status,
        metrics_json
      )
      values ($1, $2, $3, $4, $5, $6::jsonb)
      on conflict (training_run_id) do update
      set finished_at = excluded.finished_at,
          status = excluded.status,
          metrics_json = excluded.metrics_json
    `,
    [
      run.training_run_id,
      run.model_version,
      run.started_at,
      run.finished_at,
      run.status,
      JSON.stringify(run.metrics_json ?? {}),
    ],
  );
}

export async function getTrainingDataset(client, modelType) {
  if (modelType === "sector") {
    const { rows } = await client.query(`
      select
        f.trade_date,
        f.sector_code as entity_key,
        f.sector_name as entity_name,
        f.sector_return_1d,
        f.sector_return_5d,
        f.sector_return_20d,
        f.sector_volatility_20d,
        f.sector_breadth_ratio,
        f.sector_trading_value_ratio_5d,
        f.sector_excess_vs_market_1d,
        f.kospi_return_1d,
        f.kosdaq_return_1d,
        f.kosdaq_excess_return_vs_kospi,
        f.usdkrw_return_1d,
        f.dxy_close,
        f.kr_10y_yield,
        f.kr_3y_yield,
        f.kr_10y_change_5d,
        f.kr_term_spread_10y_3y,
        f.us_10y_yield,
        f.us_2y_yield,
        f.us_10y_change_5d,
        f.us_term_spread_10y_2y,
        f.wti_return_5d,
        f.brent_return_5d,
        f.nasdaq_return_1d,
        f.sox_return_1d,
        f.sp500_return_1d,
        f.vix_close,
        f.vix_return_1d,
        f.sox_return_1d_x_semiconductor,
        f.nasdaq_return_1d_x_semiconductor,
        f.usdkrw_return_1d_x_export_electronics,
        f.wti_return_5d_x_chemical,
        f.brent_return_5d_x_chemical,
        f.kr_term_spread_10y_3y_x_financial,
        f.kr_3y_yield_x_financial,
        f.nasdaq_return_1d_x_biotech,
        f.us_2y_yield_x_biotech,
        f.kr_3y_yield_x_construction,
        f.kosdaq_excess_return_vs_kospi_x_content,
        case when t.sector_return_5d_fwd > 0 then 1 else 0 end as label,
        t.sector_excess_return_5d_fwd as actual_excess_return_5d,
        t.sector_return_5d_fwd as actual_return_5d
      from sector_feature_daily f
      join sector_target_daily t
        on t.trade_date = f.trade_date
       and t.sector_code = f.sector_code
      where t.sector_return_5d_fwd is not null
      order by f.trade_date, f.sector_code
    `);
    return rows;
  }

    const { rows } = await client.query(`
      select
        f.trade_date,
        f.ticker as entity_key,
        m.name_kr as entity_name,
        f.sector_code,
        f.sector_name,
        f.stock_return_1d,
        f.stock_return_5d,
        f.stock_return_20d,
      f.stock_volatility_20d,
      f.trading_value_ratio_5d,
      f.market_cap_log,
      f.stock_turnover_ratio,
      f.relative_volume_5d,
      f.relative_volume_20d,
      f.price_vs_ma20,
      f.price_vs_ma60,
      f.price_distance_from_20d_high,
      f.price_distance_from_60d_high,
      f.relative_strength_vs_sector_20d,
      f.stock_rank_in_sector_by_return_5d,
      f.total_disclosure_count_1d,
      f.periodic_disclosure_count_1d,
      f.major_issue_disclosure_count_1d,
      f.issuance_disclosure_count_1d,
      f.equity_disclosure_count_1d,
      f.other_disclosure_count_1d,
      f.is_earnings_disclosure_day,
      f.is_capital_raise_disclosure_day,
      f.is_order_contract_disclosure_day,
      f.is_major_corporate_action_day,
      f.sector_return_1d,
      f.sector_return_5d,
      f.sector_breadth_ratio,
      f.excess_vs_sector_1d,
      f.excess_vs_sector_5d,
      f.kospi_return_1d,
      f.kosdaq_return_1d,
      f.kosdaq_excess_return_vs_kospi,
      f.usdkrw_return_1d,
      f.dxy_close,
      f.kr_10y_yield,
      f.kr_3y_yield,
      f.us_10y_yield,
      f.us_2y_yield,
      f.wti_return_5d,
      f.brent_return_5d,
      f.nasdaq_return_1d,
      f.sox_return_1d,
      f.sp500_return_1d,
      f.vix_close,
      f.vix_return_1d,
      case when t.stock_return_5d_fwd > 0 then 1 else 0 end as label,
      t.stock_excess_return_5d_fwd as actual_excess_return_5d,
      t.stock_return_5d_fwd as actual_return_5d
    from stock_feature_daily f
    join stock_target_daily t
      on t.trade_date = f.trade_date
     and t.ticker = f.ticker
    join stock_master m on m.ticker = f.ticker
    where t.stock_return_5d_fwd is not null
    ${STOCK_MODEL_SEGMENT_EXCLUSION_SQL}
    ${STOCK_MODEL_QUANT_FILTER_SQL}
    order by f.trade_date, f.ticker
  `);
  return rows;
}

export async function getActiveModels(client) {
  const { rows } = await client.query(`
    select model_version, model_type, feature_version, horizon_days, trained_from, trained_to, status, created_at, metadata
    from model_registry
    where status = 'active'
    order by model_type, created_at desc
  `);
  return rows;
}

export async function getLatestPredictionFeatureRows(client, modelType, options = {}) {
  if (modelType === "sector") {
    const { rows } = await client.query(`
      with latest as (
        select max(trade_date) as latest_trade_date
        from sector_feature_daily
      )
      select f.*
      from sector_feature_daily f
      join latest l on l.latest_trade_date = f.trade_date
      order by f.sector_code
    `);
    return rows;
  }

  const sectorCodes = Array.isArray(options.sectorCodes) ? options.sectorCodes.filter(Boolean) : [];
  const params = [];
  let sectorFilterSql = "";

  if (sectorCodes.length > 0) {
    params.push(sectorCodes);
    sectorFilterSql = `and f.sector_code = any($${params.length})`;
  }

  const { rows } = await client.query(`
    with latest as (
      select max(trade_date) as latest_trade_date
      from stock_feature_daily
    )
    select f.*, m.name_kr
    from stock_feature_daily f
    join latest l on l.latest_trade_date = f.trade_date
    join stock_master m on m.ticker = f.ticker
    where 1 = 1
    ${STOCK_MODEL_SEGMENT_EXCLUSION_SQL}
    ${STOCK_MODEL_QUANT_FILTER_SQL}
    ${sectorFilterSql}
    order by f.ticker
  `, params);
  return rows;
}

export async function getHistoricalPredictionFeatureRows(client, modelType) {
  if (modelType === "sector") {
    const { rows } = await client.query(`
      select f.*
      from sector_feature_daily f
      join sector_target_daily t
        on t.trade_date = f.trade_date
       and t.sector_code = f.sector_code
      where t.sector_return_5d_fwd is not null
      order by f.trade_date, f.sector_code
    `);
    return rows;
  }

  const { rows } = await client.query(`
    select f.*
    from stock_feature_daily f
    join stock_target_daily t
      on t.trade_date = f.trade_date
     and t.ticker = f.ticker
    join stock_master m on m.ticker = f.ticker
    where t.stock_return_5d_fwd is not null
    ${STOCK_MODEL_SEGMENT_EXCLUSION_SQL}
    ${STOCK_MODEL_QUANT_FILTER_SQL}
    order by f.trade_date, f.ticker
  `);
  return rows;
}

export async function replaceSectorPredictions(client, predictionDate, modelVersion, rows) {
  await client.query(
    `delete from sector_prediction_daily where prediction_date = $1 and model_version = $2`,
    [predictionDate, modelVersion],
  );

  for (const row of rows) {
    await client.query(
      `
        insert into sector_prediction_daily (
          prediction_date,
          sector_code,
          sector_name,
          model_version,
          probability,
          score,
          rank,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, current_timestamp)
      `,
      [predictionDate, row.sector_code, row.sector_name, modelVersion, row.probability, row.score, row.rank],
    );
  }
}

export async function replaceStockPredictions(client, predictionDate, modelVersion, rows) {
  await client.query(
    `delete from stock_prediction_daily where prediction_date = $1 and model_version = $2`,
    [predictionDate, modelVersion],
  );

  for (const row of rows) {
    await client.query(
      `
        insert into stock_prediction_daily (
          prediction_date,
          ticker,
          sector_code,
          sector_name,
          model_version,
          probability,
          score,
          rank,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, current_timestamp)
      `,
      [predictionDate, row.ticker, row.sector_code, row.sector_name, modelVersion, row.probability, row.score, row.rank],
    );
  }
}

export async function refreshPredictionEvaluations(client) {
  await client.query(`
    insert into prediction_evaluation_daily (
      prediction_date,
      entity_type,
      entity_key,
      model_version,
      predicted_probability,
      actual_return_5d,
      actual_excess_return_5d,
      hit_flag,
      created_at
    )
    select
      p.prediction_date,
      'sector',
      p.sector_code,
      p.model_version,
      p.probability,
      t.sector_return_5d_fwd,
      t.sector_excess_return_5d_fwd,
      case when t.sector_return_5d_fwd > 0 then 1 else 0 end,
      current_timestamp
    from sector_prediction_daily p
    join sector_target_daily t
      on t.trade_date = p.prediction_date
     and t.sector_code = p.sector_code
    where t.sector_return_5d_fwd is not null
    on conflict (prediction_date, entity_type, entity_key, model_version) do update
    set predicted_probability = excluded.predicted_probability,
        actual_return_5d = excluded.actual_return_5d,
        actual_excess_return_5d = excluded.actual_excess_return_5d,
        hit_flag = excluded.hit_flag,
        created_at = current_timestamp
  `);

  await client.query(`
    insert into prediction_evaluation_daily (
      prediction_date,
      entity_type,
      entity_key,
      model_version,
      predicted_probability,
      actual_return_5d,
      actual_excess_return_5d,
      hit_flag,
      created_at
    )
    select
      p.prediction_date,
      'stock',
      p.ticker,
      p.model_version,
      p.probability,
      t.stock_return_5d_fwd,
      t.stock_excess_return_5d_fwd,
      case when t.stock_return_5d_fwd > 0 then 1 else 0 end,
      current_timestamp
    from stock_prediction_daily p
    join stock_target_daily t
      on t.trade_date = p.prediction_date
     and t.ticker = p.ticker
    where t.stock_return_5d_fwd is not null
    on conflict (prediction_date, entity_type, entity_key, model_version) do update
    set predicted_probability = excluded.predicted_probability,
        actual_return_5d = excluded.actual_return_5d,
        actual_excess_return_5d = excluded.actual_excess_return_5d,
        hit_flag = excluded.hit_flag,
        created_at = current_timestamp
  `);
}

export async function getMonitoringOverview(client) {
  const [dataStatus, activeModels, topSectors, topStocks, performanceRows, latestPredictionDate] = await Promise.all([
    client.query(`
      select
        (select max(trade_date) from stock_daily_snapshot) as latest_stock_trade_date,
        (select max(trade_date) from market_daily_factors) as latest_market_trade_date,
        (select count(*)::integer from stock_master) as stock_master_count,
        (select count(*)::integer from stock_industry_classification where is_current = 1) as classified_count,
        (
          select count(*)::integer
          from stock_master m
          left join stock_industry_classification c
            on c.ticker = m.ticker
           and c.is_current = 1
          where c.ticker is null
        ) as missing_classification_count,
        (
          select max(created_at)
          from stock_prediction_daily
        ) as latest_prediction_run_at
    `),
    client.query(`
      select model_version, model_type, trained_from, trained_to, created_at, metadata
      from model_registry
      where status = 'active'
      order by model_type, created_at desc
    `),
    client.query(`
      with latest as (
        select max(prediction_date) as prediction_date
        from sector_prediction_daily
      ),
      previous as (
        select
          p.sector_code,
          p.rank,
          row_number() over (partition by p.sector_code order by p.prediction_date desc) as rn
        from sector_prediction_daily p
      )
      select
        p.prediction_date,
        p.sector_code,
        p.sector_name,
        p.probability,
        p.rank,
        p.model_version,
        prev.rank as previous_rank
      from sector_prediction_daily p
      join latest l on l.prediction_date = p.prediction_date
      left join previous prev
        on prev.sector_code = p.sector_code
       and prev.rn = 2
      order by p.rank
      limit 12
    `),
    client.query(`
      with latest as (
        select max(prediction_date) as prediction_date
        from stock_prediction_daily
      ),
      previous as (
        select
          p.ticker,
          p.rank,
          row_number() over (partition by p.ticker order by p.prediction_date desc) as rn
        from stock_prediction_daily p
      )
      select
        p.prediction_date,
        p.ticker,
        m.name_kr,
        p.sector_name,
        p.probability,
        p.rank,
        p.model_version,
        prev.rank as previous_rank
      from stock_prediction_daily p
      join latest l on l.prediction_date = p.prediction_date
      join stock_master m on m.ticker = p.ticker
      left join previous prev
        on prev.ticker = p.ticker
       and prev.rn = 2
      order by p.rank
      limit 20
    `),
    client.query(`
      with scored as (
        select
          prediction_date,
          entity_type,
          model_version,
          count(*) filter (where hit_flag = 1)::integer as hit_count,
          count(*)::integer as total_count,
          avg(actual_excess_return_5d) as avg_excess_return,
          avg(predicted_probability) as avg_probability
        from prediction_evaluation_daily
        where (
          (entity_type = 'sector' and entity_key in (
            select sector_code
            from sector_prediction_daily sp
            where sp.prediction_date = prediction_evaluation_daily.prediction_date
              and sp.model_version = prediction_evaluation_daily.model_version
              and sp.rank <= 5
          )) or
          (entity_type = 'stock' and entity_key in (
            select ticker
            from stock_prediction_daily sp
            where sp.prediction_date = prediction_evaluation_daily.prediction_date
              and sp.model_version = prediction_evaluation_daily.model_version
              and sp.rank <= 20
          ))
        )
        group by prediction_date, entity_type, model_version
      )
      select *
      from scored
      order by prediction_date desc, entity_type
      limit 20
    `),
    client.query(`
      select max(prediction_date) as latest_prediction_date
      from (
        select prediction_date from sector_prediction_daily
        union all
        select prediction_date from stock_prediction_daily
      ) d
    `),
  ]);

  const status = dataStatus.rows[0] ?? {};
  return {
    dataStatus: {
      latestStockTradeDate: toDateText(status.latest_stock_trade_date),
      latestMarketTradeDate: toDateText(status.latest_market_trade_date),
      stockMasterCount: Number(status.stock_master_count ?? 0),
      classifiedCount: Number(status.classified_count ?? 0),
      missingClassificationCount: Number(status.missing_classification_count ?? 0),
      latestPredictionRunAt: status.latest_prediction_run_at ? new Date(status.latest_prediction_run_at).toISOString() : null,
    },
    activeModels: activeModels.rows.map((row) => ({
      modelVersion: row.model_version,
      modelType: row.model_type,
      trainedFrom: toDateText(row.trained_from),
      trainedTo: toDateText(row.trained_to),
      createdAt: new Date(row.created_at).toISOString(),
      metadata: row.metadata ?? {},
    })),
    latestPredictionDate: toDateText(latestPredictionDate.rows[0]?.latest_prediction_date),
    topSectors: topSectors.rows.map((row) => ({
      predictionDate: toDateText(row.prediction_date),
      sectorCode: row.sector_code,
      sectorName: row.sector_name,
      probability: Number(row.probability),
      rank: Number(row.rank),
      previousRank: row.previous_rank === null ? null : Number(row.previous_rank),
      modelVersion: row.model_version,
    })),
    topStocks: topStocks.rows.map((row) => ({
      predictionDate: toDateText(row.prediction_date),
      ticker: row.ticker,
      name: row.name_kr,
      sectorName: row.sector_name,
      probability: Number(row.probability),
      rank: Number(row.rank),
      previousRank: row.previous_rank === null ? null : Number(row.previous_rank),
      modelVersion: row.model_version,
    })),
    performance: performanceRows.rows.map((row) => ({
      predictionDate: toDateText(row.prediction_date),
      entityType: row.entity_type,
      modelVersion: row.model_version,
      hitCount: Number(row.hit_count ?? 0),
      totalCount: Number(row.total_count ?? 0),
      hitRatio: Number(row.total_count ?? 0) > 0 ? Number(row.hit_count ?? 0) / Number(row.total_count) : 0,
      avgExcessReturn: row.avg_excess_return === null ? null : Number(row.avg_excess_return),
      avgProbability: row.avg_probability === null ? null : Number(row.avg_probability),
    })),
  };
}
