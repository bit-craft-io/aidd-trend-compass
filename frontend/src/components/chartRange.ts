// 時刻は、分足なら UNIX 秒(数値)、日足以上なら日付の文字(YYYY-MM-DD)。チャートのライブラリは、どちらも受け取る
export interface VisibleRange {
  from: number | string;
  to: number | string;
}

const SECONDS_PER_DAY = 86400;

// 分足の時刻は、日本時間の壁時計を、UTC として入れた UNIX 秒(バックエンドの `timeframe_service` と同じ作り)。
// ゆえに、時刻 ÷ 86400 の整数部が、日本時間の日付になる。足のある日付を数えるので、土日・祝日は、数えない。
function dayOf(time: number): number {
  return Math.floor(time / SECONDS_PER_DAY);
}

// 最後の `days` 営業日の、最初の足〜最後の足の時刻を返す。最新の日は、場の途中でも、1日として数える。
// 返す `null` は、「範囲を指定せず、全部を出す」の意味: 時刻が数値でない(日足以上)とき、足が空のとき、`days` 営業日以下のとき。
export function recentTradingDaysRange(times: (string | number)[], days = 3): VisibleRange | null {
  if (times.length === 0 || times.some((t) => typeof t !== "number")) return null;

  const sorted = [...(times as number[])].sort((a, b) => a - b);
  const tradingDays = Array.from(new Set(sorted.map(dayOf)));
  if (tradingDays.length <= days) return null;

  const firstDay = tradingDays[tradingDays.length - days];
  const from = sorted.find((t) => dayOf(t) === firstDay) as number;
  return { from, to: sorted[sorted.length - 1] };
}

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 日足: 最後の日を含めて、暦日 `days` 日分の、最初の足〜最後の足を返す。境界の日に足が無い(週末など)ときは、次の足から。
// 返す `null` は、「範囲を指定せず、全部を出す」の意味: 時刻が日付の文字でない、足が空、全部が `days` 暦日に収まるとき。
export function recentCalendarDaysRange(times: (string | number)[], days = 30): VisibleRange | null {
  if (times.length === 0 || times.some((t) => typeof t !== "string" || !DATE_TEXT.test(t))) return null;

  const sorted = [...(times as string[])].sort();
  const last = sorted[sorted.length - 1];
  const boundary = addDays(last, -(days - 1));
  if (sorted[0] >= boundary) return null;

  const from = sorted.find((t) => t >= boundary) as string;
  return { from, to: last };
}

