import { Component } from 'react';

class ClassModalSkeleton extends Component {
  render() {
    return (
      <div className="modal-skeleton">
        <div className="spinner" />
        <p className="skeleton-text">Загрузка данных (class)...</p>
      </div>
    );
  }
}

export { ClassModalSkeleton };
