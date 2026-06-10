import { Modal } from './ui/Modal.js';

interface DatabaseConnectionModalProps {
  open: boolean;
  attemptCount: number;
}

export default function DatabaseConnectionModal({
  open,
  attemptCount,
}: DatabaseConnectionModalProps) {
  return (
    <Modal
      open={open}
      className="max-w-md"
      labelledBy="db-connection-modal-title"
      data-testid="db-connection-modal"
    >
      <h2 id="db-connection-modal-title" className="mb-2 text-xl font-semibold text-fg">
        Database connection problem
      </h2>
      <p className="text-sm text-fg-muted">
        The app cannot reach the database right now. We are retrying in the background.
      </p>
      <p className="mt-4 text-sm font-medium text-fg">
        Connection attempts: {Math.max(1, attemptCount)}
      </p>
    </Modal>
  );
}
