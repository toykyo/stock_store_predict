create table if not exists stock_master (
    ticker varchar(12) primary key,
    isin varchar(12),
    market varchar(10) not null,
    name_kr varchar(200) not null,
    name_en varchar(200),
    corp_name varchar(200),
    security_group_name varchar(100),
    market_segment_name varchar(100),
    security_type_name varchar(100),
    sector_code varchar(20),
    sector_name varchar(100),
    listing_date date,
    par_value numeric(18, 4),
    shares_outstanding bigint,
    status varchar(20) not null default 'active',
    created_at timestamp not null default current_timestamp,
    updated_at timestamp not null default current_timestamp
);

alter table stock_master add column if not exists name_en varchar(200);
alter table stock_master add column if not exists security_group_name varchar(100);
alter table stock_master add column if not exists market_segment_name varchar(100);
alter table stock_master add column if not exists security_type_name varchar(100);
alter table stock_master add column if not exists par_value numeric(18, 4);
alter table stock_master add column if not exists shares_outstanding bigint;

create table if not exists market_daily_factors (
    trade_date date primary key,
    kospi_close numeric(18, 6),
    kospi_return_1d numeric(12, 6),
    kosdaq_close numeric(18, 6),
    kosdaq_return_1d numeric(12, 6),
    kosdaq_excess_return_vs_kospi numeric(12, 6),
    market_total_trading_value bigint,
    investor_net_buy_foreign_kospi bigint,
    investor_net_buy_foreign_kosdaq bigint,
    investor_net_buy_inst_kospi bigint,
    investor_net_buy_inst_kosdaq bigint,
    investor_net_buy_retail_kospi bigint,
    investor_net_buy_retail_kosdaq bigint,
    usdkrw_close numeric(18, 6),
    usdkrw_return_1d numeric(12, 6),
    dxy_close numeric(18, 6),
    kr_10y_yield numeric(12, 6),
    kr_3y_yield numeric(12, 6),
    kr_term_spread_10y_3y numeric(12, 6),
    us_2y_yield numeric(12, 6),
    us_10y_yield numeric(12, 6),
    us_term_spread_10y_2y numeric(12, 6),
    wti_close numeric(18, 6),
    brent_close numeric(18, 6),
    nasdaq_return_1d numeric(12, 6),
    sox_return_1d numeric(12, 6),
    vix_close numeric(18, 6),
    vix_return_1d numeric(12, 6),
    sp500_return_1d numeric(12, 6),
    vkospi_close numeric(18, 6),
    is_fomc_day smallint not null default 0,
    is_us_cpi_day smallint not null default 0,
    is_bok_rate_decision_day smallint not null default 0,
    is_option_expiry_day smallint not null default 0,
    is_quadruple_witching_day smallint not null default 0,
    is_month_end smallint not null default 0,
    is_quarter_end smallint not null default 0,
    is_holiday_before smallint not null default 0,
    is_holiday_after smallint not null default 0,
    collected_at timestamp not null default current_timestamp
);

alter table market_daily_factors add column if not exists sp500_return_1d numeric(12, 6);
alter table market_daily_factors add column if not exists kosdaq_excess_return_vs_kospi numeric(12, 6);
alter table market_daily_factors add column if not exists dxy_close numeric(18, 6);
alter table market_daily_factors add column if not exists kr_3y_yield numeric(12, 6);
alter table market_daily_factors add column if not exists kr_term_spread_10y_3y numeric(12, 6);
alter table market_daily_factors add column if not exists us_2y_yield numeric(12, 6);
alter table market_daily_factors add column if not exists us_term_spread_10y_2y numeric(12, 6);
alter table market_daily_factors add column if not exists brent_close numeric(18, 6);
alter table market_daily_factors add column if not exists nasdaq_return_1d numeric(12, 6);
alter table market_daily_factors add column if not exists sox_return_1d numeric(12, 6);
alter table market_daily_factors add column if not exists vix_close numeric(18, 6);
alter table market_daily_factors add column if not exists vix_return_1d numeric(12, 6);

create table if not exists stock_daily_snapshot (
    trade_date date not null,
    ticker varchar(12) not null,
    market varchar(10) not null,
    name_kr varchar(200) not null,
    market_segment_name varchar(100),
    sector_code varchar(20),
    sector_name varchar(100),
    open_price numeric(18, 4),
    high_price numeric(18, 4),
    low_price numeric(18, 4),
    close_price numeric(18, 4) not null,
    change_price numeric(18, 4),
    change_rate numeric(12, 6),
    volume bigint,
    trading_value bigint,
    market_cap bigint,
    shares_outstanding bigint,
    foreign_ownership_rate numeric(8, 6),
    investor_net_buy_foreign bigint,
    investor_net_buy_inst bigint,
    investor_net_buy_retail bigint,
    collected_at timestamp not null default current_timestamp,
    primary key (trade_date, ticker),
    constraint fk_stock_daily_snapshot_ticker
        foreign key (ticker) references stock_master (ticker)
);

alter table stock_daily_snapshot add column if not exists market_segment_name varchar(100);


create table if not exists stock_industry_classification (
    ticker varchar(12) not null,
    market varchar(10) not null,
    name_kr varchar(200),
    sector_code varchar(20),
    sector_name varchar(100),
    industry_code varchar(20),
    industry_name varchar(100),
    source varchar(50) not null,
    effective_from date not null,
    effective_to date,
    is_current smallint not null default 1,
    collected_at timestamp not null default current_timestamp,
    primary key (ticker, source, effective_from),
    constraint fk_stock_industry_classification_ticker
        foreign key (ticker) references stock_master (ticker)
);

create table if not exists dart_corp_code_map (
    corp_code varchar(8) primary key,
    ticker varchar(12),
    corp_name varchar(200) not null,
    modify_date date,
    is_active smallint not null default 1,
    collected_at timestamp not null default current_timestamp
);

create table if not exists dart_disclosure_event (
    receipt_no varchar(20) primary key,
    ticker varchar(12),
    corp_code varchar(8) not null,
    corp_name varchar(200) not null,
    report_name varchar(300) not null,
    filed_date date not null,
    submitter_name varchar(200),
    remark varchar(100),
    disclosure_type_code varchar(1),
    disclosure_type_name varchar(100),
    disclosure_detail_code varchar(4),
    disclosure_detail_name varchar(200),
    event_category varchar(100),
    is_final_report smallint not null default 0,
    collected_at timestamp not null default current_timestamp,
    constraint fk_dart_disclosure_event_corp_code
        foreign key (corp_code) references dart_corp_code_map (corp_code)
);

create table if not exists stock_disclosure_daily (
    trade_date date not null,
    ticker varchar(12) not null,
    corp_code varchar(8),
    total_disclosure_count integer not null default 0,
    periodic_disclosure_count integer not null default 0,
    major_issue_disclosure_count integer not null default 0,
    issuance_disclosure_count integer not null default 0,
    equity_disclosure_count integer not null default 0,
    other_disclosure_count integer not null default 0,
    is_earnings_disclosure_day smallint not null default 0,
    is_capital_raise_disclosure_day smallint not null default 0,
    is_order_contract_disclosure_day smallint not null default 0,
    is_major_corporate_action_day smallint not null default 0,
    created_at timestamp not null default current_timestamp,
    primary key (trade_date, ticker),
    constraint fk_stock_disclosure_daily_ticker
        foreign key (ticker) references stock_master (ticker),
    constraint fk_stock_disclosure_daily_corp_code
        foreign key (corp_code) references dart_corp_code_map (corp_code)
);

alter table stock_feature_daily add column if not exists total_disclosure_count_1d integer;
alter table stock_feature_daily add column if not exists periodic_disclosure_count_1d integer;
alter table stock_feature_daily add column if not exists major_issue_disclosure_count_1d integer;
alter table stock_feature_daily add column if not exists issuance_disclosure_count_1d integer;
alter table stock_feature_daily add column if not exists equity_disclosure_count_1d integer;
alter table stock_feature_daily add column if not exists other_disclosure_count_1d integer;
alter table stock_feature_daily add column if not exists is_earnings_disclosure_day smallint;
alter table stock_feature_daily add column if not exists is_capital_raise_disclosure_day smallint;
alter table stock_feature_daily add column if not exists is_order_contract_disclosure_day smallint;
alter table stock_feature_daily add column if not exists is_major_corporate_action_day smallint;
create table if not exists sector_daily_snapshot (
    trade_date date not null,
    market varchar(10) not null,
    sector_code varchar(20) not null,
    sector_name varchar(100) not null,
    stock_count integer not null,
    advancers_count integer,
    decliners_count integer,
    flat_count integer,
    sector_return_1d numeric(12, 6),
    sector_trading_value bigint,
    sector_market_cap bigint,
    sector_avg_change_rate numeric(12, 6),
    sector_median_change_rate numeric(12, 6),
    sector_breadth_ratio numeric(12, 6),
    top_stock_ticker varchar(12),
    top_stock_name varchar(200),
    collected_at timestamp not null default current_timestamp,
    primary key (trade_date, sector_code)
);

create table if not exists sector_feature_daily (
    trade_date date not null,
    market varchar(10) not null,
    sector_code varchar(20) not null,
    sector_name varchar(100) not null,
    sector_return_1d numeric(12, 6),
    sector_return_5d numeric(12, 6),
    sector_return_20d numeric(12, 6),
    sector_volatility_20d numeric(12, 6),
    sector_breadth_ratio numeric(12, 6),
    sector_trading_value_ratio_5d numeric(12, 6),
    sector_market_cap bigint,
    sector_excess_vs_market_1d numeric(12, 6),
    kospi_return_1d numeric(12, 6),
    kosdaq_return_1d numeric(12, 6),
    kosdaq_excess_return_vs_kospi numeric(12, 6),
    usdkrw_return_1d numeric(12, 6),
    dxy_close numeric(18, 6),
    kr_10y_yield numeric(12, 6),
    kr_3y_yield numeric(12, 6),
    kr_10y_change_5d numeric(12, 6),
    us_10y_yield numeric(12, 6),
    us_2y_yield numeric(12, 6),
    us_10y_change_5d numeric(12, 6),
    us_term_spread_10y_2y numeric(12, 6),
    kr_term_spread_10y_3y numeric(12, 6),
    wti_return_5d numeric(12, 6),
    brent_return_5d numeric(12, 6),
    nasdaq_return_1d numeric(12, 6),
    sox_return_1d numeric(12, 6),
    vix_close numeric(18, 6),
    vix_return_1d numeric(12, 6),
    sp500_return_1d numeric(12, 6),
    sox_return_1d_x_semiconductor numeric(12, 6),
    nasdaq_return_1d_x_semiconductor numeric(12, 6),
    usdkrw_return_1d_x_export_electronics numeric(12, 6),
    wti_return_5d_x_chemical numeric(12, 6),
    brent_return_5d_x_chemical numeric(12, 6),
    kr_term_spread_10y_3y_x_financial numeric(12, 6),
    kr_3y_yield_x_financial numeric(12, 6),
    nasdaq_return_1d_x_biotech numeric(12, 6),
    us_2y_yield_x_biotech numeric(12, 6),
    kr_3y_yield_x_construction numeric(12, 6),
    kosdaq_excess_return_vs_kospi_x_content numeric(12, 6),
    is_month_end smallint not null default 0,
    is_quarter_end smallint not null default 0,
    is_holiday_before smallint not null default 0,
    is_holiday_after smallint not null default 0,
    created_at timestamp not null default current_timestamp,
    primary key (trade_date, sector_code)
);

alter table sector_feature_daily add column if not exists kosdaq_excess_return_vs_kospi numeric(12, 6);
alter table sector_feature_daily add column if not exists dxy_close numeric(18, 6);
alter table sector_feature_daily add column if not exists kr_3y_yield numeric(12, 6);
alter table sector_feature_daily add column if not exists us_2y_yield numeric(12, 6);
alter table sector_feature_daily add column if not exists us_term_spread_10y_2y numeric(12, 6);
alter table sector_feature_daily add column if not exists kr_term_spread_10y_3y numeric(12, 6);
alter table sector_feature_daily add column if not exists brent_return_5d numeric(12, 6);
alter table sector_feature_daily add column if not exists nasdaq_return_1d numeric(12, 6);
alter table sector_feature_daily add column if not exists sox_return_1d numeric(12, 6);
alter table sector_feature_daily add column if not exists vix_close numeric(18, 6);
alter table sector_feature_daily add column if not exists vix_return_1d numeric(12, 6);
alter table sector_feature_daily add column if not exists sox_return_1d_x_semiconductor numeric(12, 6);
alter table sector_feature_daily add column if not exists nasdaq_return_1d_x_semiconductor numeric(12, 6);
alter table sector_feature_daily add column if not exists usdkrw_return_1d_x_export_electronics numeric(12, 6);
alter table sector_feature_daily add column if not exists wti_return_5d_x_chemical numeric(12, 6);
alter table sector_feature_daily add column if not exists brent_return_5d_x_chemical numeric(12, 6);
alter table sector_feature_daily add column if not exists kr_term_spread_10y_3y_x_financial numeric(12, 6);
alter table sector_feature_daily add column if not exists kr_3y_yield_x_financial numeric(12, 6);
alter table sector_feature_daily add column if not exists nasdaq_return_1d_x_biotech numeric(12, 6);
alter table sector_feature_daily add column if not exists us_2y_yield_x_biotech numeric(12, 6);
alter table sector_feature_daily add column if not exists kr_3y_yield_x_construction numeric(12, 6);
alter table sector_feature_daily add column if not exists kosdaq_excess_return_vs_kospi_x_content numeric(12, 6);

create table if not exists sector_target_daily (
    trade_date date not null,
    market varchar(10) not null,
    sector_code varchar(20) not null,
    sector_name varchar(100) not null,
    sector_return_5d_fwd numeric(12, 6),
    market_return_5d_fwd numeric(12, 6),
    sector_excess_return_5d_fwd numeric(12, 6),
    is_excess_vs_market_5d_fwd smallint,
    created_at timestamp not null default current_timestamp,
    primary key (trade_date, sector_code)
);

create table if not exists stock_feature_daily (
    trade_date date not null,
    ticker varchar(12) not null,
    market varchar(10) not null,
    sector_code varchar(20),
    sector_name varchar(100),
    close_price numeric(18, 4),
    stock_return_1d numeric(12, 6),
    stock_return_5d numeric(12, 6),
    stock_return_20d numeric(12, 6),
    stock_volatility_20d numeric(12, 6),
    trading_value_ratio_5d numeric(12, 6),
    avg_trading_value_20d numeric(18, 2),
    trading_day_coverage_60d numeric(12, 6),
    market_cap_log numeric(18, 6),
    stock_turnover_ratio numeric(12, 6),
    relative_volume_5d numeric(12, 6),
    relative_volume_20d numeric(12, 6),
    price_vs_ma20 numeric(12, 6),
    price_vs_ma60 numeric(12, 6),
    price_distance_from_20d_high numeric(12, 6),
    price_distance_from_60d_high numeric(12, 6),
    relative_strength_vs_sector_20d numeric(12, 6),
    stock_rank_in_sector_by_return_5d numeric(12, 6),
    market_cap bigint,
    sector_return_1d numeric(12, 6),
    sector_return_5d numeric(12, 6),
    sector_breadth_ratio numeric(12, 6),
    excess_vs_sector_1d numeric(12, 6),
    excess_vs_sector_5d numeric(12, 6),
    kospi_return_1d numeric(12, 6),
    kosdaq_return_1d numeric(12, 6),
    kosdaq_excess_return_vs_kospi numeric(12, 6),
    usdkrw_return_1d numeric(12, 6),
    dxy_close numeric(18, 6),
    kr_10y_yield numeric(12, 6),
    kr_3y_yield numeric(12, 6),
    us_2y_yield numeric(12, 6),
    us_10y_yield numeric(12, 6),
    wti_return_5d numeric(12, 6),
    brent_return_5d numeric(12, 6),
    nasdaq_return_1d numeric(12, 6),
    sox_return_1d numeric(12, 6),
    vix_close numeric(18, 6),
    vix_return_1d numeric(12, 6),
    sp500_return_1d numeric(12, 6),
    is_month_end smallint not null default 0,
    is_quarter_end smallint not null default 0,
    created_at timestamp not null default current_timestamp,
    primary key (trade_date, ticker)
);

alter table stock_feature_daily add column if not exists kosdaq_excess_return_vs_kospi numeric(12, 6);
alter table stock_feature_daily add column if not exists dxy_close numeric(18, 6);
alter table stock_feature_daily add column if not exists kr_3y_yield numeric(12, 6);
alter table stock_feature_daily add column if not exists us_2y_yield numeric(12, 6);
alter table stock_feature_daily add column if not exists brent_return_5d numeric(12, 6);
alter table stock_feature_daily add column if not exists nasdaq_return_1d numeric(12, 6);
alter table stock_feature_daily add column if not exists sox_return_1d numeric(12, 6);
alter table stock_feature_daily add column if not exists vix_close numeric(18, 6);
alter table stock_feature_daily add column if not exists vix_return_1d numeric(12, 6);
alter table stock_feature_daily add column if not exists avg_trading_value_20d numeric(18, 2);
alter table stock_feature_daily add column if not exists trading_day_coverage_60d numeric(12, 6);
alter table stock_feature_daily add column if not exists market_cap_log numeric(18, 6);
alter table stock_feature_daily add column if not exists stock_turnover_ratio numeric(12, 6);
alter table stock_feature_daily add column if not exists relative_volume_5d numeric(12, 6);
alter table stock_feature_daily add column if not exists relative_volume_20d numeric(12, 6);
alter table stock_feature_daily add column if not exists price_vs_ma20 numeric(12, 6);
alter table stock_feature_daily add column if not exists price_vs_ma60 numeric(12, 6);
alter table stock_feature_daily add column if not exists price_distance_from_20d_high numeric(12, 6);
alter table stock_feature_daily add column if not exists price_distance_from_60d_high numeric(12, 6);
alter table stock_feature_daily add column if not exists relative_strength_vs_sector_20d numeric(12, 6);
alter table stock_feature_daily add column if not exists stock_rank_in_sector_by_return_5d numeric(12, 6);

create table if not exists stock_target_daily (
    trade_date date not null,
    ticker varchar(12) not null,
    market varchar(10) not null,
    sector_code varchar(20),
    sector_name varchar(100),
    stock_return_5d_fwd numeric(12, 6),
    sector_return_5d_fwd numeric(12, 6),
    stock_excess_return_5d_fwd numeric(12, 6),
    is_excess_vs_sector_5d_fwd smallint,
    created_at timestamp not null default current_timestamp,
    primary key (trade_date, ticker)
);

create table if not exists model_registry (
    model_version varchar(80) primary key,
    model_type varchar(40) not null,
    feature_version varchar(40) not null,
    horizon_days integer not null default 5,
    trained_from date,
    trained_to date,
    status varchar(20) not null,
    created_at timestamp not null default current_timestamp,
    metadata jsonb not null default '{}'::jsonb
);

create table if not exists model_training_run (
    training_run_id varchar(80) primary key,
    model_version varchar(80) not null,
    started_at timestamp not null,
    finished_at timestamp,
    status varchar(20) not null,
    metrics_json jsonb not null default '{}'::jsonb,
    constraint fk_model_training_run_model_version
        foreign key (model_version) references model_registry (model_version)
);

create table if not exists sector_prediction_daily (
    prediction_date date not null,
    sector_code varchar(20) not null,
    sector_name varchar(100) not null,
    model_version varchar(80) not null,
    probability numeric(12, 6) not null,
    score numeric(12, 6) not null,
    rank integer not null,
    created_at timestamp not null default current_timestamp,
    primary key (prediction_date, sector_code, model_version),
    constraint fk_sector_prediction_daily_model_version
        foreign key (model_version) references model_registry (model_version)
);

create table if not exists stock_prediction_daily (
    prediction_date date not null,
    ticker varchar(12) not null,
    sector_code varchar(20),
    sector_name varchar(100),
    model_version varchar(80) not null,
    probability numeric(12, 6) not null,
    score numeric(12, 6) not null,
    rank integer not null,
    created_at timestamp not null default current_timestamp,
    primary key (prediction_date, ticker, model_version),
    constraint fk_stock_prediction_daily_model_version
        foreign key (model_version) references model_registry (model_version)
);

create table if not exists prediction_evaluation_daily (
    prediction_date date not null,
    entity_type varchar(20) not null,
    entity_key varchar(40) not null,
    model_version varchar(80) not null,
    predicted_probability numeric(12, 6) not null,
    actual_return_5d numeric(12, 6),
    actual_excess_return_5d numeric(12, 6),
    hit_flag smallint,
    created_at timestamp not null default current_timestamp,
    primary key (prediction_date, entity_type, entity_key, model_version),
    constraint fk_prediction_evaluation_daily_model_version
        foreign key (model_version) references model_registry (model_version)
);

create table if not exists batch_run_log (
    run_id varchar(64) primary key,
    mode varchar(20) not null,
    trade_date date,
    started_at timestamp not null,
    finished_at timestamp,
    status varchar(20) not null,
    step_count integer not null default 0,
    notes text
);

create table if not exists batch_step_log (
    run_id varchar(64) not null,
    step_name varchar(100) not null,
    step_order integer not null,
    status varchar(20) not null,
    started_at timestamp not null,
    finished_at timestamp,
    notes text,
    primary key (run_id, step_name),
    constraint fk_batch_step_log_run_id
        foreign key (run_id) references batch_run_log (run_id)
);


create index if not exists idx_stock_industry_classification_current
    on stock_industry_classification (ticker, is_current);

create index if not exists idx_stock_industry_classification_sector
    on stock_industry_classification (sector_name, industry_name);

create index if not exists idx_stock_industry_classification_market
    on stock_industry_classification (market);
create index if not exists idx_dart_corp_code_map_ticker
    on dart_corp_code_map (ticker, is_active);

create index if not exists idx_dart_disclosure_event_filed_date
    on dart_disclosure_event (filed_date, ticker);

create index if not exists idx_dart_disclosure_event_category
    on dart_disclosure_event (event_category, filed_date desc);

create index if not exists idx_stock_disclosure_daily_trade_date
    on stock_disclosure_daily (trade_date, ticker);

create index if not exists idx_stock_daily_snapshot_ticker_date
    on stock_daily_snapshot (ticker, trade_date);

create index if not exists idx_stock_daily_snapshot_sector_date
    on stock_daily_snapshot (sector_code, trade_date);

create index if not exists idx_sector_daily_snapshot_sector_date
    on sector_daily_snapshot (sector_code, trade_date);

create index if not exists idx_market_daily_factors_trade_date
    on market_daily_factors (trade_date);

create index if not exists idx_sector_feature_daily_trade_date
    on sector_feature_daily (trade_date, sector_code);

create index if not exists idx_stock_feature_daily_trade_date
    on stock_feature_daily (trade_date, ticker);

create index if not exists idx_sector_target_daily_trade_date
    on sector_target_daily (trade_date, sector_code);

create index if not exists idx_stock_target_daily_trade_date
    on stock_target_daily (trade_date, ticker);

create index if not exists idx_model_registry_model_type_status
    on model_registry (model_type, status, created_at desc);

create index if not exists idx_sector_prediction_daily_prediction_date
    on sector_prediction_daily (prediction_date, rank);

create index if not exists idx_stock_prediction_daily_prediction_date
    on stock_prediction_daily (prediction_date, rank);

create index if not exists idx_prediction_evaluation_daily_prediction_date
    on prediction_evaluation_daily (prediction_date, entity_type, model_version);
