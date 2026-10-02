# Team Lunch User Documentation

This guide explains the normal workflow from poll to delivery. The app is designed so each phase shows a clear call to action (CTA) on screen.

## Workflow Overview

1. Start or join the poll.
2. Vote for a menu.
3. Add your meal in food selection.
4. Place the real order.
5. Track delivery and confirm arrival.

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
