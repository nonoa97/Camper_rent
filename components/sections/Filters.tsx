'use client'

interface FiltersProps {
  people: string
  type: string
  comfort: string
  onPeople: (v: string) => void
  onType: (v: string) => void
  onComfort: (v: string) => void
}

const PEOPLE = ['Összes', '2-3', '2-4', '4-6', '6+']
const TYPES = ['Összes', 'camper-van', 'alkóvos', 'integrált']
const COMFORT = ['Összes', 'alap', 'comfort', 'prémium']

function FilterGroup({ label, options, value, onChange }: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs text-[#666] uppercase tracking-wider mr-1">{label}:</span>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt === 'Összes' ? '' : opt)}
          className={`px-4 py-1.5 rounded-full text-sm border transition-all ${
            (opt === 'Összes' && value === '') || opt === value
              ? 'bg-[#1a3a2a] text-white border-[#1a3a2a]'
              : 'border-[#ddd] text-[#333] hover:border-[#1a3a2a]'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export default function Filters({ people, type, comfort, onPeople, onType, onComfort }: FiltersProps) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <FilterGroup label="Férőhely" options={PEOPLE} value={people} onChange={onPeople} />
      <FilterGroup label="Típus" options={TYPES} value={type} onChange={onType} />
      <FilterGroup label="Kényelem" options={COMFORT} value={comfort} onChange={onComfort} />
    </div>
  )
}
