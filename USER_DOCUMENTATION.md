# Team Lunch User Documentation

This guide explains the normal workflow from poll to delivery. The app is designed so each phase shows a clear call to action (CTA) on screen.

## Workflow Overview

1. Start or join the poll.
2. Vote for a menu.
3. Add your meal in food selection.
4. Place the real order.
5. Track delivery and confirm arrival.

## Configure an Office Ordering Policy

In **Administration**, open the office's settings and choose **Unrestricted** or
**1, 2, 3, or 4 weeks**, a valid IANA timezone (for example `Europe/Vienna`), and
a starting Monday. Save the settings for that office. Only administrators can
change them; other offices are unaffected.

Existing and new offices default to weekly with UTC and an editable starting
Monday. Restricted periods run from the starting Monday at office-local
midnight, not from the last lunch. For example, a Friday lunch and the following
Wednesday lunch are in different weekly periods and can both be compliant.
Only a lunch whose arrival has been confirmed counts, in the period containing
its completion time; placing an order does not use the opportunity. Unused
periods do not accumulate credit.

A future starting Monday postpones compliant starts until that date.
**Unrestricted** disables and explains the anchor field, ignores anchor edits,
and preserves the saved Monday for re-enabling. The office timezone remains
editable. Re-enabling a restriction requires a valid Monday. Policy changes
re-evaluate retained completions for future starts but never cancel an ongoing
lunch or rewrite historical exceptions.

## Manual Starts and Exceptions

Both **Start poll** and the single-menu quick start check the office policy on
the server. If the period already contains a completed lunch, or the starting
Monday is still in the future, a warning shows the next compliant start in the
office timezone. **Cancel** has initial focus; Cancel, Escape, or dismissal leave
the lunch unstarted.

Anyone already authorized to start can explicitly proceed with a written
justification of 1–500 characters after trimming whitespace. Blank or overlong
reasons cannot proceed. This exception does not bypass normal permissions or
an existing active-lunch conflict. The server checks again on submission, so a
changed policy can require a fresh warning rather than starting automatically.

Admins can view the original justification, starter identity/display snapshot,
decision time, policy settings and period/evidence in poll details and completed
lunch details/history. These snapshots do not change when a profile or office
setting changes; ordinary users do not receive the private exception details.
A completed exceptional lunch counts in its completion period like any other
lunch, without shifting the anchor or creating debt in future periods.

## Scheduled Polls and Office Policy

Administrators configure each office's schedule and timezone. Scheduled weekdays,
finish times, and same-day activity checks use that office's timezone, not the
server's timezone. Existing activity and daily duplicate checks still apply.

A restricted office allows one completed lunch per configured 1–4-week calendar
period. Scheduled polls skip a period that already contains a completed lunch,
or dates before the policy's starting Monday. They never create justified
exceptions, accumulate unused opportunities, or start immediately when a new
period opens: the configured schedule must also be due. Unrestricted removes
the interval restriction, not the other scheduling guards.

If daylight saving skips the configured finish time, no scheduled poll starts
for that time. If the clock repeats it, the earlier occurrence is used.

## Landing Availability

The landing page shows the selected office's current ordering policy above the
start controls:

- **Ready to start**: the server confirms the current period has an available opportunity; normal permissions and active-lunch checks still apply.
- **Unrestricted**: no interval restriction applies.
- **Next eligible start**: days, hours and minutes until the next period or future policy anchor, with the exact date/time and office timezone.
- **Checking / unavailable**: the server has not confirmed current availability. Use **Retry availability check** if needed; this is never treated as Ready.

The display refreshes after policy changes, arrival confirmation, reconnect and
office changes. At a countdown or eligible-period boundary it asks the server
again rather than assuming eligibility. The target is policy availability, not
a scheduled poll start.

Manual starts remain available to authorized starters. If a start would violate
the current policy, the server requires the existing warning/justification flow;
the availability card neither bypasses nor replaces that check.

## Phase CTAs

### Poll active

- CTA: vote for one or more menus.
- CTA: withdraw your vote if you changed your mind.

### Poll tied

- CTA: extend voting to collect more votes.
- CTA: pick a random winner from tied menus.

### Poll finished

- CTA: start food selection for the winning menu.

### Food selection active

- CTA: add your meal (and optional comment).
- CTA: withdraw and re-add if you need to change your meal.
- CTA when some winner-voters are still missing: remind those people personally, or use the reminder action.
- CTA when all winner-voters have ordered: `Click here when you place the order.`

### Food selection overtime

- CTA: extend collection time if people are still missing.
- CTA: confirm meal collection is done and move to ordering.

### Food ordering

- CTA: one person claims responsibility for placing the order.
- CTA for the claimer: confirm order placement and set ETA.
- CTA for others: wait for confirmation to avoid duplicate orders.

### Food delivery

- CTA: update ETA when the restaurant gives a new estimate.
- CTA: mark items delivered while checking bags.
- CTA: confirm arrival when lunch is fully delivered.

## Typical Team Process

1. Everyone votes.
2. Everyone chooses meals.
3. Organizer checks missing users list and reminds them.
4. Organizer clicks the order CTA after placing the order.
5. Team tracks ETA and confirms arrival.

If your team follows the CTAs shown in each phase, you can usually run the full process without extra training.
