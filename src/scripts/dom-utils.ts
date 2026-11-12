const numberFormat = new Intl.NumberFormat();

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function truncate(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1).trimEnd()}…` : normalized;
}
