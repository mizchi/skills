# Worker delivery contract

- queued job is eventually processed even with worker crash and retry.
- the same job id records `processed` at most once.
