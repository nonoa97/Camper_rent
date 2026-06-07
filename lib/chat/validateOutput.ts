export interface GptOutput {
  reply: string
  recommendations: { slug: string; reason: string }[]
  links: { label: string; href: string }[]
}

export const FALLBACK_OUTPUT: GptOutput = {
  reply: 'Ebben most nem vagyok teljesen biztos, pontosítsunk egy kicsit, hogy jó autót ajánljak.',
  recommendations: [],
  links: [],
}

export function validateGptOutput(
  raw: string,
  allowedSlugs: Set<string>,
  mode: string,
): GptOutput {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return FALLBACK_OUTPUT
  }

  const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : ''

  let recommendations: { slug: string; reason: string }[] = []
  if (Array.isArray(parsed.recommendations) && mode !== 'ask_next_question') {
    recommendations = (parsed.recommendations as unknown[])
      .filter(
        (r): r is { slug: string; reason: string } =>
          typeof (r as any)?.slug === 'string' &&
          (allowedSlugs.size === 0 || allowedSlugs.has((r as any).slug)),
      )
      .slice(0, 2)
      .map(r => ({ slug: r.slug, reason: typeof r.reason === 'string' ? r.reason : '' }))
  }

  const links: { label: string; href: string }[] = Array.isArray(parsed.links)
    ? (parsed.links as unknown[])
        .filter(
          (l): l is { label: string; href: string } =>
            typeof (l as any)?.label === 'string' && typeof (l as any)?.href === 'string',
        )
        .slice(0, 4)
    : []

  if (!reply && recommendations.length === 0) return FALLBACK_OUTPUT

  return { reply, recommendations, links }
}
