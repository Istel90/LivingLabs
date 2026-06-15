import { Sprout } from 'lucide-react';

interface CircularProcessProps {
  onStepClick?: (stepId: string) => void;
}

const steps = [
  { number: 1, id: '3-1' },
  { number: 2, id: '3-2' },
  { number: 3, id: '3-3' },
  { number: 4, id: '3-4' },
  { number: 5, id: '3-5' },
  { number: 6, id: '3-6' },
];

export function CircularProcess({ onStepClick }: CircularProcessProps) {
  return (
    <div className="grid min-h-80 place-items-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#0b5870,#148369)] p-8">
      <div className="relative grid size-56 place-items-center rounded-full border border-white/25">
        <div className="grid size-36 place-items-center rounded-full border border-white/25 bg-white/10">
          <Sprout className="size-16 text-emerald-200" />
        </div>

        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepClick?.(step.id)}
            aria-label={`${step.number}단계로 이동`}
            className="absolute grid size-10 place-items-center rounded-full bg-white text-sm font-black text-[#087f72] shadow-lg transition hover:scale-110 hover:bg-emerald-50 focus:outline-none focus:ring-4 focus:ring-white/40"
            style={{ transform: `rotate(${index * 60}deg) translateY(-112px) rotate(-${index * 60}deg)` }}
          >
            {step.number}
          </button>
        ))}
      </div>
    </div>
  );
}
