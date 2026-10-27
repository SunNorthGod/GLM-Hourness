# csv-lite

A small CSV reader. Run the tests with `npm test`.

## API

### `parseLine(line, { delimiter = ',' } = {})`

Splits one line into fields. A field that starts with a double quote is quoted: it may contain the delimiter, and a literal quote inside it is written as two quotes (`""`). A quote inside an unquoted field is an ordinary character.

### `parse(text, options)`

Splits `text` into lines (`\n` or `\r\n`, one trailing line end ignored) and parses each with `parseLine`.
