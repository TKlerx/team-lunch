import { useCallback, useEffect, useRef } from "react";
import type { OrderingPolicyAvailability as Availability } from "../../lib/types.js";
import { useCountdown } from "../hooks/useCountdown.js";
import { useOrderingPolicy } from "../hooks/useOrderingPolicy.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";

function formatRemaining(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return `${days} days ${hours} hours ${minutes % 60} min`;
}

function AvailabilityContent({ availability, boundary, refresh, recheck }: {
  availability: Availability;
  boundary: string | null;
  refresh: () => Promise<Availability | null>;
  recheck: (boundary: string) => void;
}) {
  const remaining = useCountdown(boundary);
  const expired = boundary !== null && remaining === 0;
  useEffect(() => {
    if (expired && boundary) recheck(boundary);
  }, [expired, boundary, recheck]);

  if (expired) {
    return <Unavailable refresh={refresh} />;
  }
  if (availability.status === "unrestricted" || availability.status === "eligible") {
    return (
      <>
        <h2 aria-live="polite" className="text-xl font-semibold text-fg">
          {availability.status === "unrestricted" ? "Unrestricted" : "Ready to start"}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          {availability.status === "unrestricted"
            ? "No ordering interval restriction."
            : "This office’s ordering policy allows a new lunch."}{" "}
          Existing permissions and active-lunch checks still apply.
        </p>
      </>
    );
  }
  const target = new Intl.DateTimeFormat(undefined, {
    timeZone: availability.timeZone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date(boundary!));
  return (
    <>
      <h2 aria-live="polite" className="text-xl font-semibold text-fg">
        Next eligible start
      </h2>
      <p role="timer" aria-live="off" className="mt-2 text-2xl font-semibold tabular-nums text-fg">
        {formatRemaining(remaining)}
      </p>
      <p className="mt-2 break-words text-sm text-fg-muted">
        <time dateTime={boundary!}>{target}</time> ({availability.timeZone})
      </p>
      <p className="mt-2 text-sm text-fg-muted">
        {availability.status === "not_started"
          ? "The policy starts at this time."
          : "This period already has a completed lunch."}{" "}
        Availability is not a scheduled poll start; no poll starts automatically
        at this time.
      </p>
    </>
  );
}

function Unavailable({
  refresh,
  loading = false,
}: {
  refresh: () => Promise<Availability | null>;
  loading?: boolean;
}) {
  return (
    <>
      <h2 aria-live="polite" className="text-xl font-semibold text-fg">
        {loading
          ? "Checking ordering availability…"
          : "Ordering availability unavailable"}
      </h2>
      <p className="mt-2 text-sm text-fg-muted">
        Current policy must be confirmed by the server.
      </p>
      {!loading ? (
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => {
            void refresh();
          }}
        >
          Retry availability check
        </Button>
      ) : null}
    </>
  );
}

function getBoundary(availability: Availability | null): string | null {
  if (!availability) return null;
  return availability.status === "eligible"
    ? availability.blockEnd
    : availability.nextEligibleAt;
}

export default function OrderingPolicyAvailability() {
  const { availability, loading, error, officeLocationId, refresh } =
    useOrderingPolicy();
  const attemptedBoundary = useRef<string | null>(null);
  const recheck = useCallback(
    (boundary: string) => {
      const key = `${officeLocationId}:${boundary}`;
      // Loading clears availability; retain the attempted boundary through that gap and failures.
      if (attemptedBoundary.current === key) return;
      attemptedBoundary.current = key;
      void refresh();
    },
    [officeLocationId, refresh],
  );
  const boundary = getBoundary(availability);
  const valid =
    availability &&
    availability.officeLocationId === officeLocationId &&
    (availability.status === "unrestricted" ||
      (boundary !== null && Number.isFinite(Date.parse(boundary))));

  return (
    <Card className="border-accent bg-surface-muted p-6">
      {valid && !loading && !error ? (
        <AvailabilityContent
          key={`${officeLocationId}:${boundary}`}
          availability={availability}
          boundary={boundary}
          refresh={refresh}
          recheck={recheck}
        />
      ) : (
        <Unavailable refresh={refresh} loading={loading} />
      )}
    </Card>
  );
}
