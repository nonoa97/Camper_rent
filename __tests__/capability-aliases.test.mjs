import { describe, expect, it } from 'vitest'
import {
  auditCapabilityAliasCoverage,
  normalizeCapabilityAlias,
  resolveCapabilityAlias,
  validateCapabilityAliasRegistry,
} from '../scripts/capability-alias-utils.mjs'

describe('capability alias registry', () => {
  it('validates the checked-in capability alias registry', () => {
    const validation = validateCapabilityAliasRegistry()

    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
  })

  it('normalizes accents, punctuation, and whitespace', () => {
    expect(normalizeCapabilityAlias('  VADKEMPINGEZNÉNK!!  ')).toBe('vadkempingeznenk')
    expect(normalizeCapabilityAlias('off-grid')).toBe('off grid')
  })

  it('resolves Hungarian usage goals to canonical capability keys', () => {
    expect(resolveCapabilityAlias('vadkempingeznénk', { locale: 'hu' })).toMatchObject({
      status: 'matched',
      capabilityKey: 'wild_camping',
    })
    expect(resolveCapabilityAlias('önellátó legyen', { locale: 'hu' })).toMatchObject({
      status: 'matched',
      capabilityKey: 'off_grid',
    })
    expect(resolveCapabilityAlias('home office útközben', { locale: 'hu' })).toMatchObject({
      status: 'matched',
      capabilityKey: 'remote_work',
    })
    expect(resolveCapabilityAlias('bringát vinnénk', { locale: 'hu' })).toMatchObject({
      status: 'matched',
      capabilityKey: 'bike_transport',
    })
    expect(resolveCapabilityAlias('télen mennénk', { locale: 'hu' })).toMatchObject({
      status: 'matched',
      capabilityKey: 'winter_use',
    })
  })

  it('resolves English usage goals to canonical capability keys', () => {
    expect(resolveCapabilityAlias('wild camping', { locale: 'en' })).toMatchObject({
      status: 'matched',
      capabilityKey: 'wild_camping',
    })
    expect(resolveCapabilityAlias('work from the camper', { locale: 'en' })).toMatchObject({
      status: 'matched',
      capabilityKey: 'remote_work',
    })
    expect(resolveCapabilityAlias('travel with pets', { locale: 'en' })).toMatchObject({
      status: 'matched',
      capabilityKey: 'pet_travel',
    })
  })

  it('keeps explicit ambiguous aliases ambiguous', () => {
    expect(resolveCapabilityAlias('szabadon állnánk meg', { locale: 'hu' })).toMatchObject({
      status: 'ambiguous',
      candidates: ['wild_camping'],
      reason: 'explicit_ambiguous_alias',
    })
  })

  it('does not treat concrete feature, attribute, or pricing phrases as capability aliases', () => {
    expect(resolveCapabilityAlias('napelem', { locale: 'hu' })).toEqual({
      status: 'unmapped',
      sourceText: 'napelem',
    })
    expect(resolveCapabilityAlias('automata váltó', { locale: 'hu' })).toEqual({
      status: 'unmapped',
      sourceText: 'automata váltó',
    })
    expect(resolveCapabilityAlias('olcsóbbat keresek', { locale: 'hu' })).toEqual({
      status: 'unmapped',
      sourceText: 'olcsóbbat keresek',
    })
  })

  it('audits coverage for all current capability keys', () => {
    const report = auditCapabilityAliasCoverage()

    expect(report.totalCapabilityCount).toBe(6)
    expect(report.noCoverageCapabilityCount).toBe(0)
    expect(report.missingHighPriorityCapabilities).toEqual([])
  })
})
