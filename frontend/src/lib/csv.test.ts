import { csvCell, toCsv } from './csv'

describe('csv export', () => {
  it('quotes values containing commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })
  it('renders null and undefined as empty and keeps numbers intact', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(12.5)).toBe('12.5')
    expect(csvCell(-3)).toBe('-3')
  })
  it('neutralises spreadsheet formula injection in text', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toMatch(/^"'=/)
    expect(csvCell('+cmd|calc')).toBe("'+cmd|calc")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
  })
  it('builds header and rows with CRLF line endings', () => {
    expect(toCsv(['Name', 'Qty'], [['Pen', 2], ['Ink, blue', 5]])).toBe('Name,Qty\r\nPen,2\r\n"Ink, blue",5')
  })
})
