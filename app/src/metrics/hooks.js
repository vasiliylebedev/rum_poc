import { useEffect, useRef } from 'react';
import { useMetrics } from './MetricsContext';

// ─────────────────────────────────────────────
// Хуки для типовых фаз
// ─────────────────────────────────────────────

// фаза срабатывает при монтировании (skeleton)
const useMetricsMark = (phase) => {
  const collector = useMetrics();
  useEffect(() => {
    collector?.start(phase);
    collector?.end(phase);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
};

// фаза срабатывает после реального paint
const useMetricsMarkAfterPaint = (phase, { finish = false } = {}) => {
  const collector = useMetrics();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    collector?.start(phase);
    requestAnimationFrame(() => {
      setTimeout(() => {
        collector?.end(phase);
        if (finish) collector?.end();
      }, 0);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
};

export { useMetricsMark, useMetricsMarkAfterPaint };
