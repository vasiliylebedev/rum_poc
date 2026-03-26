import { Component } from 'react';
import { MetricsContext } from '../../metrics/MetricsContext';
import { PhaseMark } from '../../metrics/components/PhaseMark';
import { CARD_URL } from '../../config';
import { ClassModalSkeleton } from './ClassModalSkeleton';
import { ClassModalContent } from './ClassModalContent';

class ClassModal extends Component {
  static contextType = MetricsContext;

  state = { data: null };

  componentDidMount() {
    const collector = this.context;
    this.controller = new AbortController();

    fetch(CARD_URL, { signal: this.controller.signal })
      .then(res => {
        collector?.recordNetwork(CARD_URL);
        return res.json();
      })
      .then(json => this.setState({ data: json }))
      .catch(err => {
        if (err.name !== 'AbortError') console.error(err);
      });
  }

  componentWillUnmount() {
    this.controller?.abort();
  }

  render() {
    const { onClose } = this.props;
    const { data } = this.state;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          {data ? (
            <PhaseMark key="content" fullContent>
              <ClassModalContent data={data} onClose={onClose} />
            </PhaseMark>
          ) : (
            <PhaseMark key="skeleton" optimistic>
              <ClassModalSkeleton />
            </PhaseMark>
          )}
        </div>
      </div>
    );
  }
}

export { ClassModal };
