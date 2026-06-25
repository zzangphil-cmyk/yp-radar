import tossSpark from "@/data/toss-spark.json";

export interface TossSpark {
  last: number; // 최근 종가(원)
  change: number | null; // 전일대비 등락률 %
  ret3m: number | null; // 3개월 수익률 %
  spark: number[]; // 최근 ~30거래일 종가 (과거→최신)
}
interface TossSparkData {
  asOf: string;
  source: string;
  count: number;
  bySymbol: Record<string, TossSpark>;
}

const data = tossSpark as TossSparkData;
export const tossAsOf = data.asOf;
export const tossSource = data.source;

export function getSpark(code: string): TossSpark | undefined {
  return data.bySymbol[code];
}
