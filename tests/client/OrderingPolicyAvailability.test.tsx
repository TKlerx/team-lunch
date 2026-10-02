import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, render, screen } from "./testRender.js";
import type { OrderingPolicyAvailability as Availability } from "../../src/lib/types.js";
import type { OrderingPolicyState } from "../../src/client/context/AppContext.js";

const mockUseOrderingPolicy = vi.fn();
vi.mock("../../src/client/hooks/useOrderingPolicy.js", () => ({
  useOrderingPolicy: () => mockUseOrderingPolicy(),
}));
import OrderingPolicyAvailability from "../../src/client/components/OrderingPolicyAvailability.js";

const boundary = "2026-10-18T22:00:00Z";
function policy(overrides: Partial<Availability> = {}): Availability {
  return {
    officeLocationId: "office-1",
    evaluatedAt: "2026-10-16T19:59:00Z",
    intervalWeeks: 2,
    timeZone: "Europe/Vienna",
    anchorDate: "2026-10-05",
    status: "period_used",
    blockStart: "2026-10-04T22:00:00Z",
    blockEnd: boundary,
    nextEligibleAt: boundary,
    ...overrides,
  };
}

let state: OrderingPolicyState;
const refresh = vi.fn<() => Promise<Availability | null>>();
function update(overrides: Partial<OrderingPolicyState>) {
  state = { ...state, ...overrides };
}
function tick(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T19:59:00Z"));
  state = {
    officeLocationId: "office-1",
    availability: policy(),
    loading: false,
    error: null,
  };
  refresh.mockReset().mockResolvedValue(null);
  mockUseOrderingPolicy.mockImplementation(() => ({ ...state, refresh }));
});
afterEach(() => {
  vi.useRealTimers();
});

it("ticks days/hours/minutes locally and shows the exact office-local target without a live countdown", () => {
  render(<OrderingPolicyAvailability />);
  expect(screen.getByRole("timer")).toHaveTextContent("2 days 2 hours 1 min");
  expect(screen.getByRole("timer")).toHaveAttribute("aria-live", "off");
  const target = new Intl.DateTimeFormat(undefined, {
    timeZone: "Europe/Vienna",
    dateStyle: "full",
    timeStyle: "long",
  }).format(new Date(boundary));
  expect(screen.getByText(target, { exact: false })).toBeInTheDocument();
  expect(screen.getByText(/\(Europe\/Vienna\)/)).toBeInTheDocument();
  expect(document.querySelector("time")).toHaveAttribute("datetime", boundary);
  tick(60000);
  expect(screen.getByRole("timer")).toHaveTextContent("2 days 2 hours 0 min");
  expect(refresh).not.toHaveBeenCalled();
  expect(screen.getByText(/no poll starts automatically/)).toBeInTheDocument();
});

it("shows a future anchor countdown, not Ready", () => {
  update({
    availability: policy({
      status: "not_started",
      blockStart: null,
      blockEnd: null,
      anchorDate: "2026-10-19",
    }),
  });
  render(<OrderingPolicyAvailability />);
  expect(screen.getByRole("timer")).toHaveTextContent("2 days 2 hours 1 min");
  expect(screen.getByText(/policy starts at this time/)).toBeInTheDocument();
  expect(screen.queryByText("Ready to start")).not.toBeInTheDocument();
});

it("shows Ready only for server eligibility and rechecks at its period end", () => {
  vi.setSystemTime(new Date("2026-10-18T21:59:59Z"));
  update({
    availability: policy({ status: "eligible", nextEligibleAt: null }),
  });
  render(<OrderingPolicyAvailability />);
  expect(screen.getByText("Ready to start")).toBeInTheDocument();
  tick(1000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Ready to start")).not.toBeInTheDocument();
  tick(10000);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("never shows Ready for an already-expired snapshot, even during Strict Mode effect replay", () => {
  vi.setSystemTime(new Date("2026-10-18T22:00:00Z"));
  update({
    availability: policy({ status: "eligible", nextEligibleAt: null }),
  });
  render(
    <StrictMode>
      <OrderingPolicyAvailability />
    </StrictMode>,
  );
  expect(screen.queryByText("Ready to start")).not.toBeInTheDocument();
  expect(
    screen.getByText("Ordering availability unavailable"),
  ).toBeInTheDocument();
  expect(refresh).toHaveBeenCalledTimes(1);
  tick(60000);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("shows Unrestricted without a restriction timer or recheck", () => {
  update({
    availability: policy({
      status: "unrestricted",
      intervalWeeks: 0,
      blockStart: null,
      blockEnd: null,
      nextEligibleAt: null,
    }),
  });
  render(<OrderingPolicyAvailability />);
  expect(screen.getByText("Unrestricted")).toBeInTheDocument();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  tick(86400000);
  expect(refresh).not.toHaveBeenCalled();
});

it.each([
  { availability: null, loading: true, error: null },
  { availability: null, loading: false, error: null },
  {
    availability: policy({ status: "eligible", nextEligibleAt: null }),
    loading: false,
    error: "Offline",
  },
  {
    availability: policy({
      officeLocationId: "old-office",
      status: "eligible",
      nextEligibleAt: null,
    }),
    loading: false,
    error: null,
  },
  {
    availability: policy({
      status: "eligible",
      nextEligibleAt: null,
      blockEnd: null,
    }),
    loading: false,
    error: null,
  },
])(
  "never fabricates eligibility for unavailable/loading/error/mismatched data (%#)",
  (overrides) => {
    update(overrides);
    render(<OrderingPolicyAvailability />);
    expect(screen.queryByText("Ready to start")).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveTextContent(
      overrides.loading
        ? "Checking ordering availability"
        : "Ordering availability unavailable",
    );
  },
);

it("rechecks once through loading, failure and an expired response; explicit retry recovers", async () => {
  vi.setSystemTime(new Date("2026-10-18T21:59:59Z"));
  const view = render(<OrderingPolicyAvailability />);
  tick(1000);
  expect(refresh).toHaveBeenCalledTimes(1);
  update({ availability: null, loading: true });
  view.rerender(<OrderingPolicyAvailability />);
  tick(2000);
  update({ loading: false, error: "Offline" });
  view.rerender(<OrderingPolicyAvailability />);
  update({ availability: policy(), error: null });
  view.rerender(<OrderingPolicyAvailability />);
  tick(2000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Ready to start")).not.toBeInTheDocument();
  await act(async () => {
    screen.getByRole("button", { name: "Retry availability check" }).click();
  });
  expect(refresh).toHaveBeenCalledTimes(2);
  update({
    availability: policy({
      status: "eligible",
      nextEligibleAt: null,
      blockEnd: "2026-11-01T23:00:00Z",
    }),
  });
  view.rerender(<OrderingPolicyAvailability />);
  expect(screen.getByText("Ready to start")).toBeInTheDocument();
});

it("uses a changed server target and rechecks a new boundary after rollover", () => {
  vi.setSystemTime(new Date("2026-10-18T21:59:59Z"));
  const view = render(<OrderingPolicyAvailability />);
  tick(1000);
  update({
    availability: policy({
      evaluatedAt: "2026-10-18T22:00:00Z",
      nextEligibleAt: "2026-10-18T22:02:00Z",
      blockEnd: "2026-10-18T22:02:00Z",
    }),
  });
  view.rerender(<OrderingPolicyAvailability />);
  expect(screen.getByRole("timer")).toHaveTextContent("0 days 0 hours 2 min");
  tick(120000);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
});

it("switches offices without old targets or readiness and cleans up the old timer", () => {
  vi.setSystemTime(new Date("2026-10-18T21:59:59Z"));
  const view = render(<OrderingPolicyAvailability />);
  update({ officeLocationId: "office-2" });
  view.rerender(<OrderingPolicyAvailability />);
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  tick(1000);
  expect(refresh).not.toHaveBeenCalled();
  update({
    availability: policy({
      officeLocationId: "office-2",
      timeZone: "UTC",
      nextEligibleAt: "2026-10-19T00:00:00Z",
    }),
  });
  view.rerender(<OrderingPolicyAvailability />);
  expect(screen.getByRole("timer")).toHaveTextContent("0 days 2 hours 0 min");
  expect(screen.getByText(/\(UTC\)/)).toBeInTheDocument();
  view.unmount();
  tick(7200000);
  expect(refresh).not.toHaveBeenCalled();
});

it("accepts a settings change to a nearer future boundary without a premature refresh", () => {
  const view = render(<OrderingPolicyAvailability />);
  update({ availability: policy({ nextEligibleAt: "2026-10-16T20:00:00Z" }) });
  view.rerender(<OrderingPolicyAvailability />);
  expect(screen.getByRole("timer")).toHaveTextContent("0 days 0 hours 1 min");
  expect(refresh).not.toHaveBeenCalled();
  tick(60000);
  expect(refresh).toHaveBeenCalledTimes(1);
});
