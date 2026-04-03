interface OrderCopyStatusProps {
  status: 'idle' | 'success' | 'error';
}

export default function OrderCopyStatus({ status }: OrderCopyStatusProps) {
  if (status === 'success') {
    return <p className="mt-2 text-center text-xs text-green-700">Copied to clipboard.</p>;
  }

  if (status === 'error') {
    return (
      <p className="mt-2 text-center text-xs text-red-600">
        Could not copy to clipboard in this browser context.
      </p>
    );
  }

  return null;
}
