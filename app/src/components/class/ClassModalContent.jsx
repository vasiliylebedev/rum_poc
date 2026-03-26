import { Component } from 'react';
import { MetricsContext } from '../../metrics/MetricsContext';
import { PhaseMark } from '../../metrics/components/PhaseMark';
import { CARD_EXTRA_URL } from '../../config';

class ClassModalContent extends Component {
  static contextType = MetricsContext;

  state = { extra: null };

  componentDidMount() {
    const collector = this.context;
    this.controller = new AbortController();

    fetch(CARD_EXTRA_URL, { signal: this.controller.signal })
      .then(res => {
        collector?.recordNetwork(CARD_EXTRA_URL, 'network_extra');
        return res.json();
      })
      .then(json => this.setState({ extra: json }))
      .catch(err => {
        if (err.name !== 'AbortError') console.error(err);
      });
  }

  componentWillUnmount() {
    this.controller?.abort();
  }

  render() {
    const { data, onClose } = this.props;
    const { extra } = this.state;

    return (
      <>
        <div className="modal-header">
          <h2>Ответ сервера (class)</h2>
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
}

export { ClassModalContent };
