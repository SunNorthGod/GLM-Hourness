/**
 * Split one CSV line into fields. A field that starts with a double quote is
 * quoted: it runs to the matching closing quote, may contain the delimiter,
 * and writes a literal quote as two quotes (""). A quote inside an unquoted
 * field is an ordinary character.
 */
export function parseLine(line, { delimiter = ',' } = {}) {
  const fields = []
  let field = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char !== '"') field += char
      else if (line[index + 1] === '"') field += '"'
      else quoted = false
    }
    else if (char === '"' && field === '') {
      quoted = true
    }
    else if (char === delimiter) {
      fields.push(field)
      field = ''
    }
    else {
      field += char
    }
  }
  fields.push(field)
  return fields
}

/** Parse CSV text into rows of fields; accepts \n and \r\n line ends and ignores one trailing line end. */
export function parse(text, options = {}) {
  const lines = text.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  return lines.map(line => parseLine(line, options))
}
