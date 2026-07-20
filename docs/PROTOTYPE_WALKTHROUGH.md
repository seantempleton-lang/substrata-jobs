# Step 1 prototype walkthrough

This prototype validates the field workflow and information hierarchy. It uses mocked data, a fixed demonstration clock, and browser-local state. It does not send email, generate an authoritative PDF, or write to a production database.

## Scenario A - Geotech multi-point shift

1. Open **Job 302670** from Planned work.
2. Review the rig, starting point, shift times, and planned crew. Try either **Now** button.
3. Start the daily record and review the live activity card.
4. Toggle the **Synced** chip to preview offline status.
5. Use **Start next activity** and choose a new work activity. Confirm the prior activity ends at the same time the new one begins.
6. Open **Crew** and review Leah Baxter's mid-shift departure.
7. Open **Site data** and review quantities and notes.
8. Choose **Change point**, finish BH5049, and continue on BH5050.
9. Review the continuous timeline, then select **Finish shift & review**.
10. Record **No signature**, retain the client email, and submit the draft.
11. Check that client email requires a separate deliberate send action.

## Scenario B - Group ancillary day

1. Return to assignments and choose **Start an ancillary day**.
2. Confirm the record does not require a job, rig, point, or client.
3. Start the record and review the split between **Non-job travel** and **Workshop maintenance**.
4. Add another ancillary activity and review whole-crew attendance.
5. Finish and submit the group record.

## Scenario C - Water shift

1. Open **Job 302684**.
2. Confirm Water uses the same shift, activity, crew, point, site-data, review, and submission structure.
3. Open client acknowledgement and draw on the signature pad with a mouse or finger.

## Feedback prompts

- Can a driller tell what to do next on every screen?
- Are the most frequent actions reachable with one hand?
- Does the distinction between an assignment, a daily log, an activity, and a point feel clear?
- Is the current activity prominent enough to prevent timing mistakes?
- Are crew join/leave events understandable without timesheet terminology?
- Does changing points ask for the right closing information?
- Is the client acknowledgement flow appropriate for actual site conditions?
- Is the deliberate email step obvious enough?
- What information is missing from the active-shift screen?
- Which interactions would be too slow when wearing gloves or working in poor weather?

## Step 1 acceptance

Step 1 is accepted when Water and Geotech drillers can complete the relevant walkthrough without guidance and no critical field requirement requires a fundamental change to the screen or record structure.
