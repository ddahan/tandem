// Serves the website's build (.output-site/public) for its end-to-end tests, as Caddy does
// (site/Caddyfile): files as they are, 404.html for anything else.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = new URL('../.output-site/public/', import.meta.url).pathname
const port = Number(process.argv[2] ?? 3021)
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname))
  let file = join(root, path)
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  const found = file.startsWith(root) && existsSync(file)
  if (!found) file = join(root, '404.html')
  response.writeHead(found ? 200 : 404, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
  })
  createReadStream(file).pipe(response)
}).listen(port, '127.0.0.1')
