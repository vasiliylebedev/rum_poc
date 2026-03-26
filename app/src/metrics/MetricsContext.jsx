import { createContext, useContext } from 'react';

// ─────────────────────────────────────────────
// React Context — пробрасывает коллектор в дерево
// ─────────────────────────────────────────────

const metricsContext = createContext(null);

const MetricsProcess = ({ collector, children }) => (
  <metricsContext.Provider value={collector}>
    {children}
  </metricsContext.Provider>
);

const useMetrics = () => useContext(metricsContext);

export { metricsContext as MetricsContext, MetricsProcess, useMetrics };
