# duration-kit

Small helpers for human-readable durations. Run the tests with `npm test`.

## API

### `formatDuration(ms)`

Formats a non-negative integer number of milliseconds as space-separated segments from the largest unit down (`h`, `m`, `s`, `ms`), skipping zero segments. `formatDuration(3723004)` returns `'1h 2m 3s 4ms'`; `formatDuration(0)` returns `'0ms'`. Throws `TypeError` for anything else.
