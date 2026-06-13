import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  featureRows: [] as Array<{ id: number; key: string | null }>,
  featureSelectError: null as { message: string } | null,
  camperUpdateError: null as { message: string } | null,
  camperInsertError: null as { message: string } | null,
  camperFeatureInsertError: null as { message: string } | null,
  fromCalls: [] as string[],
  camperUpdates: [] as unknown[],
  camperInserts: [] as unknown[],
  camperFeatureDeletes: [] as string[],
  camperFeatureInserts: [] as unknown[][],
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { app_metadata: { role: 'admin' } } },
      }),
    },
  }),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      db.fromCalls.push(table)

      if (table === 'features') {
        return {
          select: () => ({
            in: async (_column: string, ids: number[]) => ({
              data: db.featureRows.filter(row => ids.includes(row.id)),
              error: db.featureSelectError,
            }),
          }),
        }
      }

      if (table === 'campers') {
        return {
          update: (payload: unknown) => ({
            eq: async () => {
              db.camperUpdates.push(payload)
              return { error: db.camperUpdateError }
            },
          }),
          insert: (payload: unknown) => ({
            select: () => ({
              single: async () => {
                db.camperInserts.push(payload)
                return {
                  data: db.camperInsertError ? null : { id: 'new-camper-id' },
                  error: db.camperInsertError,
                }
              },
            }),
          }),
          delete: () => ({
            eq: async () => ({ error: null }),
          }),
        }
      }

      if (table === 'camper_features') {
        return {
          delete: () => ({
            eq: async (_column: string, camperId: string) => {
              db.camperFeatureDeletes.push(camperId)
              return { error: null }
            },
          }),
          insert: async (rows: unknown[]) => {
            db.camperFeatureInserts.push(rows)
            return { error: db.camperFeatureInsertError }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  },
}))

import { actionCreateCamper, actionSaveCamper } from '@/app/admin/actions'

const camperPayload = {
  name: 'Test Camper',
  slug: 'test-camper',
  description: null,
  overview_title: null,
  overview_body: null,
  available: true,
  year: 2026,
  type: 'Camper van' as const,
  gearbox: 'Automata' as const,
  fuel_type: 'Dízel' as const,
  beds: 4,
  feature_ids: [] as number[],
}

describe('admin camper feature assignment actions', () => {
  beforeEach(() => {
    db.featureRows = []
    db.featureSelectError = null
    db.camperUpdateError = null
    db.camperInsertError = null
    db.camperFeatureInsertError = null
    db.fromCalls = []
    db.camperUpdates = []
    db.camperInserts = []
    db.camperFeatureDeletes = []
    db.camperFeatureInserts = []
  })

  it('rejects unknown feature ids before updating camper assignments', async () => {
    db.featureRows = [{ id: 1, key: 'cassette_wc' }]

    const result = await actionSaveCamper('camper-1', {
      ...camperPayload,
      feature_ids: [1, 999],
    })

    expect(result).toEqual({ error: 'Ismeretlen felszereltség azonosító: 999.' })
    expect(db.camperUpdates).toEqual([])
    expect(db.camperFeatureDeletes).toEqual([])
    expect(db.camperFeatureInserts).toEqual([])
  })

  it('rejects keyless features before creating a camper', async () => {
    db.featureRows = [{ id: 2, key: null }]

    const result = await actionCreateCamper({
      ...camperPayload,
      feature_ids: [2],
    })

    expect(result).toEqual({
      id: null,
      error: 'Canonical key nélküli felszereltség nem rendelhető lakóautóhoz: 2.',
    })
    expect(db.camperInserts).toEqual([])
    expect(db.camperFeatureInserts).toEqual([])
  })

  it('deduplicates valid existing feature ids before saving camper assignments', async () => {
    db.featureRows = [
      { id: 1, key: 'cassette_wc' },
      { id: 2, key: 'solar_panel' },
    ]

    const result = await actionSaveCamper('camper-1', {
      ...camperPayload,
      feature_ids: [1, 1, 2],
    })

    expect(result).toEqual({ error: null })
    expect(db.camperFeatureDeletes).toEqual(['camper-1'])
    expect(db.camperFeatureInserts).toEqual([
      [
        { camper_id: 'camper-1', feature_id: 1 },
        { camper_id: 'camper-1', feature_id: 2 },
      ],
    ])
  })
})
