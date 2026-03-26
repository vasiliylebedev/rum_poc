// ─────────────────────────────────────────────
// MetricsBuffer — буфер событий
// ─────────────────────────────────────────────

const BUFFER_LIMIT = 500;

const metricsBuffer = {
  _events: [],

  push(event) {
    this._events.push(event);
    if (this._events.length >= BUFFER_LIMIT) {
      this.flush();
    }
  },

  flush() {
    if (!this._events.length) return;
    const events = this._events.splice(0);
    // TODO: заменить на navigator.sendBeacon('/api/metrics', JSON.stringify({ events }));
    console.table(events);
  },
};

// отправка при закрытии вкладки
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') metricsBuffer.flush();
});

// плановая отправка каждые 10 секунд
setInterval(() => metricsBuffer.flush(), 10 * 1000);

export { metricsBuffer };
