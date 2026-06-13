// Aktuális ár-szezon meghatározása a mai dátum alapján, a `seasons` tábla
// from_md / to_md (HH-NN) tartományaiból. Kezeli az évhatárt is (pl. holtszezon
// 10-01 → 04-30). A camper_prices.season_id a seasons.id-re hivatkozik.

export interface SeasonRow {
  id: string
  name: string
  from_md: string
  to_md: string
}

export function resolveCurrentSeason(
  seasons: SeasonRow[],
  date: Date = new Date(),
): { id: string; name: string } {
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const inSeason = (from: string, to: string) => {
    const cur = parseInt(md.replace('-', ''))
    const f = parseInt(from.replace('-', ''))
    const t = parseInt(to.replace('-', ''))
    return f <= t ? cur >= f && cur <= t : cur >= f || cur <= t
  }
  const match = seasons.find(s => inSeason(s.from_md, s.to_md))
  // Fallback: ha valamiért nincs találat, a főszezon a biztonságos alapérték.
  return { id: match?.id ?? 'peak', name: match?.name ?? 'Főszezon' }
}
