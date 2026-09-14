// @ts-ignore - no types needed beyond default export usage
import qrcode from 'qrcode-generator'

/** Renders an SVG string for the given text, safe to inline in HTML. */
export function qrSvg(text: string, size = 220): string {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const count = qr.getModuleCount()
  const cell = size / count
  let cells = ''
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        cells += `<rect x="${(col * cell).toFixed(2)}" y="${(row * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" />`
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR code">
    <rect width="${size}" height="${size}" fill="#ffffff"/>
    <g fill="#0b1f3a">${cells}</g>
  </svg>`
}

/** Returns a data: URI containing the SVG, usable as an <img src>. */
export function qrDataUri(text: string, size = 220): string {
  const svg = qrSvg(text, size)
  const b64 = btoa(unescape(encodeURIComponent(svg)))
  return `data:image/svg+xml;base64,${b64}`
}
