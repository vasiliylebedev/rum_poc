import { metricsBuffer } from './MetricsBuffer';

// ─────────────────────────────────────────────
// MetricsCollector — замеры таймингов процесса
// ─────────────────────────────────────────────

const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

class MetricsCollector {
  #id;
  #name;
  #tags;
  #startTime;
  #finished = false;
  #phases = new Map();

  constructor(name, tags = {}) {
    this.#id = generateId();
    this.#name = name;
    this.#tags = tags;
  }

  // start()       — старт всего процесса
  // start(phase)  — старт конкретной фазы
  start(phase) {
    if (!phase) {
      if (this.#startTime) {
        console.warn(`[metrics] ${this.#name}: process already started`);
        return this;
      }
      this.#startTime = performance.now();
      return this;
    }

    const key = `${this.#name}:${phase}`;
    if (this.#phases.has(key)) {
      console.warn(`[metrics] ${key} already started`);
      return this;
    }
    this.#phases.set(key, performance.now());
    return this;
  }

  // end()       — завершить весь процесс (E2E метрика)
  // end(phase)  — завершить конкретную фазу
  end(phase) {
    if (!phase) {
      if (!this.#startTime) {
        console.warn(`[metrics] ${this.#name}: process not started`);
        return this;
      }
      if (this.#finished) {
        console.warn(`[metrics] ${this.#name}: process already finished`);
        return this;
      }
      this.#finished = true;

      metricsBuffer.push({
        id:     this.#id,
        metric: this.#name,
        phase:  'total',
        value:  Math.round(performance.now() - this.#startTime),
        tags:   this.#tags,
        ts:     Date.now(),
      });
      return this;
    }

    const key = `${this.#name}:${phase}`;
    const phaseStart = this.#phases.get(key);
    if (phaseStart == null) {
      console.warn(`[metrics] ${key} not started`);
      return this;
    }
    this.#phases.delete(key);

    const now = performance.now();
    metricsBuffer.push({
      id:          this.#id,
      metric:      this.#name,
      phase,
      value:       Math.round(now - phaseStart),
      offsetStart: Math.round(phaseStart - this.#startTime),
      offsetEnd:   Math.round(now - this.#startTime),
      tags:        this.#tags,
      ts:          Date.now(),
    });
    return this;
  }

  // Фиксирует точку на таймлайне относительно старта процесса.
  // В отличие от start/end (которые измеряют длительность произвольного отрезка),
  // mark измеряет время от start() до текущего момента.
  mark(phase) {
    if (!this.#startTime) {
      console.warn(`[metrics] ${this.#name}: process not started`);
      return this;
    }

    const now = performance.now();
    metricsBuffer.push({
      id:     this.#id,
      metric: this.#name,
      phase,
      value:  Math.round(now - this.#startTime),
      tags:   this.#tags,
      ts:     Date.now(),
    });
    return this;
  }

  // Фиксирует окончание фазы после того как браузер реально отрисовал пиксели.
  //
  // Проблема: React вызывает useEffect после завершения reconciliation и commit,
  // но до того как браузер выполнил paint. Если вызвать end() прямо в useEffect —
  // марка встанет до реальной отрисовки и время окажется заниженным.
  //
  // Решение — двухуровневое откладывание:
  //   1. requestAnimationFrame — браузер вызовет коллбэк перед следующим paint,
  //      после того как React закончил все DOM-мутации текущего кадра
  //   2. setTimeout(0) внутри rAF — откладывает выполнение на следующую
  //      макрозадачу, уже после того как браузер выполнил paint
  //
  // Итого: start() вызывается сразу (в useEffect), end() — после реального paint.
  // Это даёт корректное время рендера с точки зрения пользователя.
  //
  // Когда использовать:
  //   - render:full_content — когда важно зафиксировать момент когда контент
  //     стал виден пользователю, а не просто записан в DOM
  //   - render:interactive — финальная фаза процесса, после которой компонент
  //     полностью готов к взаимодействию (все useEffect выполнены, обработчики навешаны)
  //
  // Когда НЕ использовать:
  //   - для сетевых фаз (network:ttfb, network:total) — там paint не при чём
  //   - для быстрых синхронных фаз (optimistic:to_visible, data:deserialization) —
  //     там важна точность момента, а не paint
  endAfterPaint(phase) {
    requestAnimationFrame(() => {
      setTimeout(() => this.end(phase), 0);
    });
    return this;
  }

  // фиксируем сетевые тайминги из PerformanceResourceTiming
  recordNetwork(url, phase = 'network') {
    setTimeout(() => {
      const entry = performance
        .getEntriesByType('resource')
        .filter(e => e.name === url && e.startTime >= this.#startTime)
        .at(-1);

      if (!entry) return;

      metricsBuffer.push({
        id:          this.#id,
        metric:      this.#name, phase: `${phase}:ttfb`,
        value:       Math.round(entry.responseStart - entry.requestStart),
        offsetStart: Math.round(entry.requestStart - this.#startTime),
        offsetEnd:   Math.round(entry.responseStart - this.#startTime),
        tags:        this.#tags, ts: Date.now(),
      });
      metricsBuffer.push({
        id:          this.#id,
        metric:      this.#name, phase: `${phase}:total`,
        value:       Math.round(entry.responseEnd - entry.fetchStart),
        offsetStart: Math.round(entry.fetchStart - this.#startTime),
        offsetEnd:   Math.round(entry.responseEnd - this.#startTime),
        tags:        this.#tags, ts: Date.now(),
      });
    }, 0);

    return this;
  }
}

export { MetricsCollector };
