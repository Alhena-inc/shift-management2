import type { Shift } from '../types';
import { SERVICE_CONFIG } from '../types';

interface Props {
  shift: Shift;
}

export function ShiftCard({ shift }: Props) {
  const config = SERVICE_CONFIG[shift.serviceType];

  return (
    <div
      className="text-[9px] leading-tight p-0.5 rounded border-l-2 w-full bg-white"
      style={{
        borderLeftColor: config.color
      }}
    >
      <div className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{shift.startTime}-{shift.endTime}</div>
      <div className="whitespace-nowrap overflow-hidden text-ellipsis">
        {shift.clientName}({config.label})
        {shift.sequence && `/${shift.sequence}`}
      </div>
      <div className="text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">{shift.duration}h</div>
      <div className="text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">{shift.area}</div>
    </div>
  );
}
