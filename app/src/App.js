import { useState } from 'react';
import './App.css';
import { MetricsCollector } from './metrics/MetricsCollector';
import { MetricsProcess } from './metrics/MetricsContext';
import { Modal } from './components/functional/Modal';
import { ClassModal } from './components/class/ClassModal';

function App() {
  const [modal, setModal] = useState(null);

  const handleOpen = (type) => {
    const collector = new MetricsCollector('card:open');
    collector.start();
    setModal({ type, collector });
  };

  const handleClose = () => {
    setModal(null);
  };

  return (
    <MetricsProcess collector={modal?.collector}>
      <div className="App">
        <header className="App-header">
          <h1>RUM PoC</h1>
          <div className="button-group">
            <button className="open-btn" onClick={() => handleOpen('hooks')}>
              Открыть карточку (hooks)
            </button>
            <button className="open-btn" onClick={() => handleOpen('class')}>
              Открыть карточку (class)
            </button>
          </div>
          {modal?.type === 'hooks' && <Modal onClose={handleClose} />}
          {modal?.type === 'class' && <ClassModal onClose={handleClose} />}
        </header>
      </div>
    </MetricsProcess>
  );
}

export default App;
