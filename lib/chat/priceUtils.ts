export function positivePriceOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

export function positivePriceOrNull(value: unknown): number | null {
  return positivePriceOrUndefined(value) ?? null
}
