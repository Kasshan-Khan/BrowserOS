'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="flex flex-col items-end justify-center px-3 py-1 rounded-lg cursor-default select-none"
      style={{ color: '#cdd6f4', minWidth: 72 }}
    >
      <span className="text-sm font-medium tabular-nums">
        {format(now, 'h:mm a')}
      </span>
      <span className="text-xs" style={{ color: '#6c7086' }}>
        {format(now, 'MMM d')}
      </span>
    </div>
  );
}
