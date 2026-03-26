// ─────────────────────────────────────────────
// withMetrics — обёртка для axios
// ─────────────────────────────────────────────

const withMetrics = (axiosInstance, collector, phase = 'network') => {
  const tracked = axiosInstance.create(axiosInstance.defaults);

  tracked.interceptors.request.use((config) => {
    collector.start(`${phase}:${config.url}`);
    return config;
  });

  tracked.interceptors.response.use((response) => {
    collector.recordNetwork(response.config.url, phase);
    return response;
  });

  return tracked;
};

export { withMetrics };
