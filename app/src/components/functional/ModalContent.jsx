import { useState, useEffect } from 'react';
import { useMetrics } from '../../metrics/MetricsContext';
import { PhaseMark } from '../../metrics/components/PhaseMark';
import { CARD_EXTRA_URL } from '../../config';

function ModalContent({ data, onClose }) {
  const collector = useMetrics();
  const [extra, setExtra] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(CARD_EXTRA_URL, { signal: controller.signal })
      .then(res => {
        collector?.recordNetwork(CARD_EXTRA_URL, 'network_extra');
        return res.json();
      })
      .then(json => setExtra(json))
      .catch(err => {
        if (err.name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="modal-header">
        <h2>Ответ сервера</h2>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>
      <div className="modal-body">
        <p><strong>Status:</strong> {data.status}</p>
        <p><strong>Message:</strong> {data.message}</p>
        <p><strong>Delay:</strong> {data.delay}ms</p>
        <p><strong>Timestamp:</strong> {data.timestamp}</p>
        {extra ? (
          <PhaseMark key="interactive" interactive finish>
            <p><strong>Extra:</strong> {extra.message}</p>
          </PhaseMark>
        ) : (
          <p><em>Loading extra...</em></p>
        )}
      </div>
    </>
  );
}

export { ModalContent };
