'use client'

interface FiltersProps {
  people: string
  type: string
  onPeople: (v: string) => void
  onType: (v: string) => void
}

const PEOPLE = ['Összes', '2+', '4+', '6+']
const TYPES = ['Összes', 'Camper van', 'Alkóvos', 'Integrált', 'Félintegrált']

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
              ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
              : 'border-[var(--color-border)] text-[#333] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface)]'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

export default function Filters({ people, type, onPeople, onType }: FiltersProps) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <FilterGroup label="Férőhely" options={PEOPLE} value={people} onChange={onPeople} />
      <FilterGroup label="Típus" options={TYPES} value={type} onChange={onType} />
    </div>
  )
}
