export type TrendDirection = "up" | "down" | "flat";
export type TrendName = TrendDirection | "none";

export interface Trend {
  id: number;
  code: string;
  name: string;
  opinion: string;
  price_at_fetch: number;
  created_at: string;
  trend_group_id: number | null;
  buy_category: number;
  buy_price: number | null;
  buy_quantity: number | null;
  sale_price_target?: number | null;
  type_daily_trend?: TrendName | null;
  perspectives?: Perspectives | null;
}

export interface TrendGroup {
  id: number;
  name: string;
}

export interface PositionInput {
  trend_group_id: number | null;
  buy_category: number;
  buy_price: number | null;
  buy_quantity: number | null;
  sale_price_target: number | null;
}

export interface TrendPrice extends PositionInput {
  code: string;
}

export interface Candle {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  time: string | number;
  value: number;
}

export interface MacdDetail {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: IndicatorPoint[];
}

export interface BollingerDetail {
  upper: IndicatorPoint[];
  middle: IndicatorPoint[];
  lower: IndicatorPoint[];
}

export interface HistoryDetail {
  candles: Candle[];
  sma5: IndicatorPoint[];
  high_60d: number;
  low_60d: number;
  volume_change_pct: number;
  rsi?: IndicatorPoint[];
  macd?: MacdDetail;
  bollinger?: BollingerDetail;
}

export interface MacroCorrelation {
  us10y: number;
  usdjpy: number;
}

export interface MarketAnalysisDetail {
  sector_label: string;
  relative_strength_5d_pt: number;
  macro_correlation: MacroCorrelation;
}

export type Sentiment = "positive" | "neutral" | "negative";

export interface NewsItem {
  headline: string;
  sentiment: Sentiment;
  url: string;
  published_at: string;
}

export interface Perspectives {
  buy: string;
  sell: string;
  keep: string;
  created_at: string;
}

export interface TrendDetail extends Trend {
  detail: {
    history?: HistoryDetail;
    market_analysis?: MarketAnalysisDetail;
    news?: NewsItem[];
  };
}

export interface ScreeningStatus {
  api_key_configured: boolean;
  cooldown_active: boolean;
  remaining_cooldown_seconds: number;
  rate_limit_per_64s: number;
  max_stocks: number;
  is_free_mode: boolean;
  last_run_at?: string | null;
}

export interface ScreeningCondition {
  id: number;
  name: string;
  enabled_signals: string[];
}

export interface ScreeningSearchResult {
  condition_id: number;
  condition_name: string;
  matched_count: number;
}

export interface ScreeningResultItem {
  code: string;
  name: string;
  price: number | null;
  matched_signals: string[];
  type_daily_trend: TrendName;
}

export interface ScreeningResultsPage {
  condition_id: number;
  total: number;
  items: ScreeningResultItem[];
}

export interface ScreeningCandles {
  code: string;
  name: string;
  candles: Candle[];
  sma5: IndicatorPoint[];
}

export interface ScreeningRegisterResult {
  registered: string[];
  skipped_count: number;
  failed: string[];
}
