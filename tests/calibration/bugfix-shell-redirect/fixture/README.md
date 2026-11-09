# redirect-scan

Finds the files a shell command line writes through output redirections, for a tool that checks commands before it runs them. Run the tests with `npm test`.

## API

### `redirectTargets(command)`

Returns the files `command` writes through output redirections, in the order they appear. Throws a `TypeError` when `command` is not a string.

### `writesFiles(command)`

Whether `redirectTargets(command)` is not empty.

## Conventions

- An operator is `>` (write) or `>>` (append), optionally right after a stream number `1` to `6` or `*` (`2> err.txt`, `*> all.txt`). It counts only at the start of a word: at the beginning of the command or after whitespace.
- The target is the word after the operator, with or without spaces between them. A target in single or double quotes is one word without its quotes (`> "out file.txt"` is `out file.txt`).
- A stream merge such as `2>&1` writes no file.
- `nul`, `NUL`, `$null` and `/dev/null` discard the output: they are not targets.
- Text inside single or double quotes is data, never syntax: `git commit -m 'a > b'` and `node -e "x => x"` write no file. An unclosed quote runs to the end of the command.
