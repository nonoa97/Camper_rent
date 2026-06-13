import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { createCamperFeatureRows, createFeatureIdByKey } from './seed-feature-utils.mjs'

const SUPABASE_URL = 'https://yjelwuevrxfiloodtzlb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZWx3dWV2cnhmaWxvb2R0emxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDY0MTQsImV4cCI6MjA5NjA4MjQxNH0.TFzrEfVYVS2xAeDys4xiR243L4RifvIcWZrSsynQjPA'
const CAMPERS_DIR = 'C:\\Users\\nonoa\\Desktop\\Campers'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const CAMPERS = [
  {
    folder: 'Capron A68',
    name: 'Capron A68',
    slug: 'capron-a68',
    price_per_day: 55000,
    type_id: 2, // alkóvos
    capacity_id: 2, // 2-4 fő
    description: 'A Capron A68 egy kényelmes alkóvos lakóautó 2019-ből, automata sebességváltóval. 6,6 méteres hosszával bőséges helyet kínál: padlófűtés, napelem, klíma, zuhanyzó és öblítéses WC is a fedélzeten. Ideális párok vagy kis családok számára.',
    featureKeys: ['cab_ac', 'shower', 'cassette_wc', 'refrigerator', 'gas_stove', 'solar_panel'],
  },
  {
    folder: 'Challenger Nordic',
    name: 'Challenger Nordic 377',
    slug: 'challenger-nordic-377',
    price_per_day: 50000,
    type_id: 2, // alkóvos
    capacity_id: 2, // 2-4 fő
    description: 'A Challenger Nordic 377 egy téli kalandokra felkészített alkóvos lakóautó 2016-ból, spiked téligumikkal és sütővel. Napelem, zuhanyzó, TV és napernyő teszi teljessé a komfortot. Hosszabb utakra ideális választás.',
    featureKeys: ['cab_ac', 'shower', 'cassette_wc', 'refrigerator', 'gas_stove', 'solar_panel'],
  },
  {
    folder: 'Eura Mobil Integra line',
    name: 'Eura Mobil Integra Line',
    slug: 'eura-mobil-integra',
    price_per_day: 65000,
    type_id: 3, // integrált
    capacity_id: 3, // 4-6 fő
    description: 'Az Eura Mobil Integra Line egy tágas integrált lakóautó 2015-ből, automata váltóval. Padlófűtés, napelem, TV és klíma a lakótérben is. Zuhanyzó, öblítéses WC és napernyő teszi teljessé – ideális nagyobb társaságnak.',
    featureKeys: ['cab_ac', 'shower', 'cassette_wc', 'refrigerator', 'gas_stove', 'solar_panel'],
  },
  {
    folder: 'Hobby T75HF',
    name: 'Hobby T75HF',
    slug: 'hobby-t75hf',
    price_per_day: 58000,
    type_id: 2, // alkóvos
    capacity_id: 2, // 2-4 fő
    description: 'A Hobby T75HF egy 2018-as, félintegrált lakóautó összkerékhajtással és téli felkészítéssel. Klíma mind a kabinban, mind a lakótérben, padlófűtéssel és zuhanyzóval. Aktív kalandvágyóknak tökéletes választás.',
    featureKeys: ['cab_ac', 'shower', 'cassette_wc', 'refrigerator', 'gas_stove'],
  },
  {
    folder: 'Hymer Ayers Rock',
    name: 'Hymer Ayers Rock',
    slug: 'hymer-ayers-rock',
    price_per_day: 45000,
    type_id: 1, // camper-van
    capacity_id: 1, // 2-3 fő
    description: 'A Hymer Ayers Rock egy kompakt és manőverezhető camper van 2018-ból, automata váltóval. Téligumikkal és vonóhoroggal felszerelve, kisméretű de teljes komforttal. Városban és vidéken egyaránt otthonos.',
    featureKeys: ['cab_ac', 'cassette_wc', 'refrigerator', 'gas_stove'],
  },
  {
    folder: 'Karmann Mobil',
    name: 'Karmann Mobil Dexter',
    slug: 'karmann-mobil-dexter',
    price_per_day: 38000,
    type_id: 1, // camper-van
    capacity_id: 1, // 2-3 fő
    description: 'A Karmann Mobil Dexter egy megbízható camper van 2012-ből, automata váltóval. Napelempanel, zuhanyzó, öblítéses WC és klíma a fedélzeten. Bluetooth és CD-lejátszó is tartozik hozzá – remek ár-érték arány.',
    featureKeys: ['cab_ac', 'shower', 'cassette_wc', 'refrigerator', 'gas_stove', 'solar_panel'],
  },
  {
    folder: 'Rapido 8096DF',
    name: 'Rapido 8096DF',
    slug: 'rapido-8096df',
    price_per_day: 85000,
    type_id: 3, // integrált
    capacity_id: 3, // 4-6 fő
    description: 'A Rapido 8096DF a flotta legújabb és legtávolabb vitele darabja: 2023-as integrált lakóautó, klímával mindkét zónában és padlófűtéssel. Napelem, zuhanyzó és automata váltó – tökéletes hosszabb utakhoz és nagyobb társasághoz.',
    featureKeys: ['cab_ac', 'shower', 'cassette_wc', 'refrigerator', 'gas_stove', 'solar_panel'],
  },
  {
    folder: 'Sprinter',
    name: 'Hymer Grand Canyon S',
    slug: 'hymer-grand-canyon-s',
    price_per_day: 52000,
    type_id: 1, // camper-van
    capacity_id: 1, // 2-3 fő
    description: 'A Hymer Grand Canyon S egy prémium Mercedes Sprinter alapú camper van 2021-ből. Automata váltóval, padlófűtéssel, napelemmel, zuhanyzóval és TV-vel felszerelve. Télre adaptált – egész évben bevethető.',
    featureKeys: ['cab_ac', 'shower', 'cassette_wc', 'refrigerator', 'gas_stove', 'solar_panel'],
  },
  {
    folder: 'Vw Crafter',
    name: 'VW Crafter Offgrid',
    slug: 'vw-crafter-offgrid',
    price_per_day: 48000,
    type_id: 1, // camper-van
    capacity_id: 1, // 2-3 fő
    description: 'A VW Crafter Offgrid Overlander egy 2020-as, off-road kialakítású camper van napelempanellel és automata váltóval. Téligumikkal felszerelve, aszfalton és úttalan terepen egyaránt otthon érzi magát. Igazi felfedezők választása.',
    featureKeys: ['cab_ac', 'cassette_wc', 'refrigerator', 'gas_stove', 'solar_panel'],
  },
]

async function uploadImage(localPath, storagePath) {
  const content = fs.readFileSync(localPath)
  const ext = path.extname(localPath).toLowerCase()
  const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp'

  const { error } = await supabase.storage
    .from('campers')
    .upload(storagePath, content, { contentType, upsert: true })

  if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`)

  return supabase.storage.from('campers').getPublicUrl(storagePath).data.publicUrl
}

async function main() {
  // 1. Delete old data
  console.log('Régi adatok törlése...')
  await supabase.from('camper_features').delete().neq('camper_id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('campers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Törölve.')

  const { data: featureRows, error: featureLoadError } = await supabase
    .from('features')
    .select('id, key')

  if (featureLoadError) throw new Error(`Feature lista betöltési hiba: ${featureLoadError.message}`)

  const featureIdByKey = createFeatureIdByKey(featureRows)

  for (const camper of CAMPERS) {
    const folderPath = path.join(CAMPERS_DIR, camper.folder)
    console.log(`\nFeldolgozás: ${camper.name}`)

    // Upload hero image
    const files = fs.readdirSync(folderPath)
    const heroFile = files.find(f => f.toLowerCase().startsWith('hero'))
    if (!heroFile) { console.warn(`  ⚠ Nincs hero kép: ${camper.folder}`); continue }

    const heroPath = path.join(folderPath, heroFile)
    const heroExt = path.extname(heroFile)
    const heroStoragePath = `${camper.slug}/hero${heroExt}`
    console.log(`  Hero feltöltése: ${heroFile}`)
    const heroUrl = await uploadImage(heroPath, heroStoragePath)
    console.log(`  URL: ${heroUrl}`)

    // Upload other images
    const otherFiles = files.filter(f => !f.toLowerCase().startsWith('hero') && f !== 'description.txt')
    const imageUrls = []
    for (const file of otherFiles) {
      const filePath = path.join(folderPath, file)
      const storageP = `${camper.slug}/${file}`
      try {
        const url = await uploadImage(filePath, storageP)
        imageUrls.push(url)
        console.log(`  Kép feltöltve: ${file}`)
      } catch (e) {
        console.warn(`  ⚠ Kép hiba (${file}): ${e.message}`)
      }
    }

    // Insert camper
    const { data: inserted, error: insertErr } = await supabase
      .from('campers')
      .insert({
        name: camper.name,
        slug: camper.slug,
        description: camper.description,
        price_per_day: camper.price_per_day,
        image_url: heroUrl,
        images: imageUrls,
        available: true,
        type_id: camper.type_id,
        capacity_id: camper.capacity_id,
      })
      .select('id')
      .single()

    if (insertErr) { console.error(`  ✗ DB insert hiba: ${insertErr.message}`); continue }
    console.log(`  ✓ Beillesztve (id: ${inserted.id})`)

    // Insert features
    const { rows: camperFeatureRows, missingFeatureKeys } = createCamperFeatureRows(
      inserted.id,
      camper.featureKeys,
      featureIdByKey,
    )
    if (missingFeatureKeys.length > 0) {
      console.warn(`  ⚠ Hiányzó feature key: ${missingFeatureKeys.join(', ')}`)
    }

    const { error: featErr } = await supabase.from('camper_features').insert(camperFeatureRows)
    if (featErr) console.warn(`  ⚠ Feature hiba: ${featErr.message}`)
    else console.log(`  ✓ ${camperFeatureRows.length} feature hozzárendelve`)
  }

  console.log('\n✅ Kész!')
}

main().catch(console.error)
