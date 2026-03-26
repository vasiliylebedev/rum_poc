import { useEffect, useLayoutEffect, useRef } from 'react';
import { useMetrics } from '../MetricsContext';

// ─────────────────────────────────────────────
// PhaseMark — декларативная обёртка для render-фаз
// ─────────────────────────────────────────────
//
// Оборачивает компонент и автоматически фиксирует встроенные
// render-фазы на таймлайне процесса (относительно collector.start()).
//
// Флаги:
//   optimistic  — optimistic:to_visible  (после paint)
//   fullContent — render:full_content     (после useEffect детей)
//   interactive — render:interactive      (после paint, после всех эффектов)
//   finish      — завершить весь процесс после последней фазы
//
// Порядок срабатывания:
//   useLayoutEffect (DOM ready, до paint)
//     → optimistic: rAF+setTimeout
//   useEffect (после useEffect детей)
//     → fullContent: сразу
//     → interactive: rAF+setTimeout (после paint)
//     → finish: после interactive (или после fullContent, если interactive не задан)

const PhaseMark = ({ optimistic, fullContent, interactive, finish, children }) => {
  const collector = useMetrics();
  const doneLayout = useRef(false);
  const doneEffect = useRef(false);

  // до paint — для optimistic (скелетон в DOM, ждём paint)
  useLayoutEffect(() => {
    if (!collector || doneLayout.current) return;
    doneLayout.current = true;

    if (optimistic) {
      requestAnimationFrame(() => {
        setTimeout(() => collector.mark('optimistic:to_visible'), 0);
      });
    }
  }, []);

  // после useEffect всех детей
  useEffect(() => {
    if (!collector || doneEffect.current) return;
    doneEffect.current = true;

    if (fullContent) collector.mark('render:full_content');

    if (interactive) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          collector.mark('render:interactive');
          if (finish) collector.end();
        }, 0);
      });
    } else if (finish) {
      collector.end();
    }
  }, []);

  return children;
};

export { PhaseMark };
