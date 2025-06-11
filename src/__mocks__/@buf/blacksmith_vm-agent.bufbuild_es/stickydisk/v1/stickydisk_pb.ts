export enum Metric_MetricType {
  UNSPECIFIED = 0,
  COUNTER = 1,
  GAUGE = 2,
  HISTOGRAM = 3
}

export class Metric {
  type: Metric_MetricType = Metric_MetricType.UNSPECIFIED;
  value: number = 0;
  labels: Record<string, string> = {};
}
