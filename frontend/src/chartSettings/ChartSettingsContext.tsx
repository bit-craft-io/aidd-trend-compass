import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Interval = "5m" | "10m" | "15m" | "1d" | "1wk" | "1mo";
export type IndicatorKey = "rsi" | "macd" | "bollinger";

interface ChartSettingsContextValue {
  interval: Interval;
  indicators: IndicatorKey[];
  setInterval: (interval: Interval) => void;
  toggleIndicator: (indicator: IndicatorKey) => void;
}

const STORAGE_KEY = "trend-compass-chart-settings";
const VALID_INTERVALS: Interval[] = ["5m", "10m", "15m", "1d", "1wk", "1mo"];
const VALID_INDICATORS: IndicatorKey[] = ["rsi", "macd", "bollinger"];

interface StoredSettings {
  interval: Interval;
  indicators: IndicatorKey[];
}

const ChartSettingsContext = createContext<ChartSettingsContextValue | null>(null);

function readStoredSettings(): StoredSettings {
  const fallback: StoredSettings = { interval: "1d", indicators: [] };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    const interval = VALID_INTERVALS.includes(parsed.interval) ? parsed.interval : fallback.interval;
    const indicators = Array.isArray(parsed.indicators)
      ? parsed.indicators.filter((i: unknown): i is IndicatorKey => VALID_INDICATORS.includes(i as IndicatorKey))
      : fallback.indicators;
    return { interval, indicators };
  } catch {
    return fallback;
  }
}

function writeStoredSettings(settings: StoredSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function ChartSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoredSettings>(readStoredSettings);

  const setInterval = useCallback((interval: Interval) => {
    setSettings((prev) => {
      const next = { ...prev, interval };
      writeStoredSettings(next);
      return next;
    });
  }, []);

  const toggleIndicator = useCallback((indicator: IndicatorKey) => {
    setSettings((prev) => {
      const has = prev.indicators.includes(indicator);
      const indicators = has
        ? prev.indicators.filter((i) => i !== indicator)
        : [...prev.indicators, indicator];
      const next = { ...prev, indicators };
      writeStoredSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ interval: settings.interval, indicators: settings.indicators, setInterval, toggleIndicator }),
    [settings, setInterval, toggleIndicator]
  );

  return <ChartSettingsContext.Provider value={value}>{children}</ChartSettingsContext.Provider>;
}

export function useChartSettings(): ChartSettingsContextValue {
  const ctx = useContext(ChartSettingsContext);
  if (!ctx) {
    throw new Error("useChartSettings must be used within a ChartSettingsProvider");
  }
  return ctx;
}
