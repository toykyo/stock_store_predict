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
    market_total_trading_value bigint,
    investor_net_buy_foreign_kospi bigint,
    investor_net_buy_foreign_kosdaq bigint,
    investor_net_buy_inst_kospi bigint,
    investor_net_buy_inst_kosdaq bigint,
    investor_net_buy_retail_kospi bigint,
    investor_net_buy_retail_kosdaq bigint,
    usdkrw_close numeric(18, 6),
    usdkrw_return_1d numeric(12, 6),
    kr_10y_yield numeric(12, 6),
    us_10y_yield numeric(12, 6),
    wti_close numeric(18, 6),
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

create index if not exists idx_stock_daily_snapshot_ticker_date
    on stock_daily_snapshot (ticker, trade_date);

create index if not exists idx_stock_daily_snapshot_sector_date
    on stock_daily_snapshot (sector_code, trade_date);

create index if not exists idx_sector_daily_snapshot_sector_date
    on sector_daily_snapshot (sector_code, trade_date);

create index if not exists idx_market_daily_factors_trade_date
    on market_daily_factors (trade_date);
