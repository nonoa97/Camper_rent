import { Camper } from '@/lib/types'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Image from 'next/image'
import Link from 'next/link'

export default function CamperGrid({ campers }: { campers: Camper[] }) {
  if (campers.length === 0) {
    return (
      <div className="text-center py-20 text-[#666]">
        <p className="text-lg">Nincs találat a szűrési feltételekre.</p>
        <p className="text-sm mt-2">Próbálj más szűrőkkel.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {campers.map(camper => {
        const beds = (camper as any).beds as number | null | undefined
        const type = (camper as any).type
        const price = (camper as any).price_per_day
          ? `${(camper as any).price_per_day.toLocaleString('hu-HU')} Ft`
          : null

        return (
          <Link key={camper.id} href={`/katalogus/${(camper as any).slug ?? camper.id}`}>
          <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
            {camper.image_url && (
              <div className="relative h-[200px] w-full">
                <Image src={camper.image_url} alt={camper.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
              </div>
            )}
            <div className="p-6">
              <div className="flex gap-2 mb-3 text-xs text-[#888] uppercase tracking-wider">
                {beds != null && <span>{beds} fő</span>}
                {type && <><span>·</span><span>{type}</span></>}
              </div>
              <h3 className="text-xl font-bold text-[#111] mb-2">{camper.name}</h3>
              {camper.description && (
                <p className="text-[#666] text-sm mb-4 leading-relaxed">{camper.description}</p>
              )}
              <div className="flex items-center justify-between mt-4">
                {price && <span className="text-[var(--color-primary)] text-[20px] font-extrabold">{price} / nap</span>}
                <div className="flex gap-2 ml-auto">
                  {camper.detail_url && (
                    <Button variant="outline" className="text-sm px-4 py-2">Részletek</Button>
                  )}
                  <Button variant="dark" className="text-sm px-4 py-2">Ajánlatkérés</Button>
                </div>
              </div>
            </div>
          </Card>
          </Link>
        )
      })}
    </div>
  )
}
