interface DatabaseConnectionModalProps {
  open: boolean;
  attemptCount: number;
}

export default function DatabaseConnectionModal({
  open,
  attemptCount,
}: DatabaseConnectionModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="db-connection-modal"
    >
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Database connection problem</h2>
        <p className="text-sm text-gray-700">
          The app cannot reach the database right now. We are retrying in the background.
        </p>
        <p className="mt-4 text-sm font-medium text-gray-900">
          Connection attempts: {Math.max(1, attemptCount)}
        </p>
      </div>
    </div>
  );
}
