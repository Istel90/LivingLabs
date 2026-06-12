interface CircularProcessProps {
  onStepClick?: (stepId: string) => void;
}

export function CircularProcess({ onStepClick }: CircularProcessProps) {
  const steps = [
    { number: 1, label: '제2차 적응대책 종합평가', color: '#3b82f6', id: '3-1' },
    { number: 2, label: '지역 현황 및 기후변화\n적응여건 분석', color: '#10b981', id: '3-2' },
    { number: 3, label: '지역 리스크 도출', color: '#f59e0b', id: '3-3' },
    { number: 4, label: '제3차 적응대책\n추진방향 설정', color: '#ef4444', id: '3-4' },
    { number: 5, label: '제3차 적응대책(안)\n마련', color: '#8b5cf6', id: '3-5' },
    { number: 6, label: '적응대책 수립 확정', color: '#06b6d4', id: '3-6' },
  ];

  const centerX = 175;
  const centerY = 175;
  const radius = 115;
  const stepCount = steps.length;

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-center mb-3">
        <h3 className="text-sm font-bold text-gray-900">지방 기후위기 적응대책</h3>
        <h3 className="text-sm font-bold text-gray-900">리빙랩 지원 플랫폼</h3>
        <p className="text-xs text-gray-600 mt-1">적응대책 수립 절차</p>
      </div>
      
      <div className="flex justify-center">
        <svg width="350" height="360" viewBox="0 0 350 360" className="max-w-full h-auto">
          {/* Circular arrows path */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 6 3, 0 6" fill="#22c55e" />
            </marker>
          </defs>

          {/* Draw circular path with arrows */}
          {steps.map((_, index) => {
            const angle1 = (index * 360) / stepCount - 90;
            const angle2 = ((index + 1) * 360) / stepCount - 90;
            
            const rad1 = (angle1 * Math.PI) / 180;
            const rad2 = (angle2 * Math.PI) / 180;
            
            const x1 = centerX + radius * Math.cos(rad1);
            const y1 = centerY + radius * Math.sin(rad1);
            const x2 = centerX + radius * Math.cos(rad2);
            const y2 = centerY + radius * Math.sin(rad2);

            const midAngle = ((angle1 + angle2) / 2 * Math.PI) / 180;
            const controlX = centerX + (radius + 15) * Math.cos(midAngle);
            const controlY = centerY + (radius + 15) * Math.sin(midAngle);

            return (
              <path
                key={`arrow-${index}`}
                d={`M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`}
                fill="none"
                stroke="#22c55e"
                strokeWidth="3"
                markerEnd="url(#arrowhead)"
                opacity="0.8"
              />
            );
          })}

          {/* Center circle with logo */}
          <circle
            cx={centerX}
            cy={centerY}
            r="40"
            fill="#f0fdf4"
            stroke="#84cc16"
            strokeWidth="2"
          />
          
          {/* Center icon - leaf/plant representing living lab */}
          <g transform={`translate(${centerX}, ${centerY})`}>
            {/* Simple leaf icon */}
            <path
              d="M -10 -7 Q -10 -17, 0 -20 Q 10 -17, 10 -7 Q 10 3, 0 7 Q -10 3, -10 -7"
              fill="#22c55e"
              opacity="0.8"
            />
            <path
              d="M 0 -20 L 0 7"
              stroke="#16a34a"
              strokeWidth="1.5"
            />
            {/* Small leaves */}
            <ellipse cx="-5" cy="-10" rx="4" ry="7" fill="#84cc16" opacity="0.7" transform="rotate(-30 -5 -10)" />
            <ellipse cx="5" cy="-10" rx="4" ry="7" fill="#84cc16" opacity="0.7" transform="rotate(30 5 -10)" />
          </g>

          {/* Draw steps in circles */}
          {steps.map((step, index) => {
            const angle = (index * 360) / stepCount - 90;
            const rad = (angle * Math.PI) / 180;
            const x = centerX + radius * Math.cos(rad);
            const y = centerY + radius * Math.sin(rad);

            return (
              <g 
                key={`step-${index}`}
                onClick={() => onStepClick?.(step.id)}
                className={onStepClick ? 'cursor-pointer' : ''}
                style={{ cursor: onStepClick ? 'pointer' : 'default' }}
              >
                {/* Step circle */}
                <circle
                  cx={x}
                  cy={y}
                  r="26"
                  fill={step.color}
                  opacity="0.9"
                  className={onStepClick ? 'transition-opacity hover:opacity-100' : ''}
                />
                
                {/* Step number */}
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="16"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none' }}
                >
                  {step.number}
                </text>

                {/* Step label below circle */}
                <foreignObject
                  x={x - 50}
                  y={y + 32}
                  width="100"
                  height="50"
                  style={{ pointerEvents: 'none' }}
                >
                  <div className="text-center text-[10px] font-semibold text-gray-800 leading-tight">
                    {step.label}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
