# Support routing guide

Apply the following rules in order. Stop at the first matching rule.

- R1: If security_issue is true, choose the security queue, regardless of other fields.
- R2: Otherwise, if impact is company-wide and workaround is false, choose incident.
- R3: Otherwise, if account_lockout is true, choose identity.
- R4: Otherwise, choose support.

A workaround prevents R2 from matching; it does not override R1 or R3.
Field names and queue names are literal values. Do not create extra queue names.
