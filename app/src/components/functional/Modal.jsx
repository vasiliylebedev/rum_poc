import { useState, useEffect } from 'react';
import { useMetrics } from '../../metrics/MetricsContext';
import { PhaseMark } from '../../metrics/components/PhaseMark';
import { CARD_URL } from '../../config';
import { ModalSkeleton } from './ModalSkeleton';
import { ModalContent } from './ModalContent';

function Modal({ onClose }) {
  const collector = useMetrics();
  const [data, setData] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(CARD_URL, { signal: controller.signal })
      .then(res => {
        collector?.recordNetwork(CARD_URL);
        return res.json();
      })
      .then(json => setData(json))
      .catch(err => {
        if (err.name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {data ? (
          <PhaseMark key="content" fullContent>
            <ModalContent data={data} onClose={onClose} />
          </PhaseMark>
        ) : (
          <PhaseMark key="skeleton" optimistic>
            <ModalSkeleton />
          </PhaseMark>
        )}
      </div>
    </div>
  );
}

export { Modal };
