commit 01 change trial duration to 14 days
billing/trial.ts - expires = started + 7 * DAY
billing/trial.ts + expires = started + 14 * DAY
portal/badge.ts - const active = now < started + 7 * DAY
portal/badge.ts + const active = now < started + 14 * DAY
commit 02 start trial at activation, not signup
billing/trial.ts - expires = signup + 14 * DAY
billing/trial.ts + expires = activation + 14 * DAY
portal/badge.ts - const active = now < signup + 14 * DAY
portal/badge.ts + const active = now < activation + 14 * DAY
