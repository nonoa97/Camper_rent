import { Camper } from '@/lib/types'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Image from 'next/image'

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
      {campers.map(camper => (
        <Card key={camper.id} className="overflow-hidden">
          {camper.image_url && (
            <div className="relative h-52 w-full">
              <Image src={camper.image_url} alt={camper.name} fill className="object-cover" />
            </div>
          )}
          <div className="p-6">
            <div className="flex gap-2 mb-3 text-xs text-[#666] uppercase tracking-wider">
              <span>{camper.people} fő</span>
              <span>·</span>
              <span>{camper.type}</span>
            </div>
            <h3 className="text-xl font-bold text-[#111] mb-2">{camper.name}</h3>
            {camper.description && (
              <p className="text-[#666] text-sm mb-4 leading-relaxed">{camper.description}</p>
            )}
            <div className="flex items-center justify-between mt-4">
              <span className="text-[#1a3a2a] font-bold text-lg">{camper.price} / nap</span>
              <div className="flex gap-2">
                {camper.detail_url && (
                  <Button variant="outline" className="text-sm px-4 py-2">Részletek</Button>
                )}
                <Button variant="primary" className="text-sm px-4 py-2 bg-[#1a3a2a] text-white hover:bg-[#2d4a2d]">
                  Ajánlatkérés
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
