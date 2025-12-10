import { ShiftTable } from './components/ShiftTable';
import { helpers, shifts } from './data/mockData';
import { SERVICE_CONFIG } from './types';

function App() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">📅 2025年12月 シフト表</h1>
      <div className="flex gap-3 mb-4 text-sm flex-wrap">
        {Object.entries(SERVICE_CONFIG).map(([key, config]) => (
          <span key={key} className="px-2 py-1 rounded" style={{ backgroundColor: config.bgColor, borderLeft: `3px solid ${config.color}` }}>
            {config.label}
          </span>
        ))}
      </div>
      <ShiftTable helpers={helpers} shifts={shifts} year={2025} month={12} />
    </div>
  );
}

export default App;
