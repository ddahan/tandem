// Which VS Code icon (https://icones.js.org/collection/vscode-icons) each file extension gets.
// After changing this map, run `./mf pnpm --filter @myfluence/web file-icons` to regenerate
// file-icons.generated.ts (the icons' SVG, bundled: no network, no blink).

export const DEFAULT_FILE_ICON = 'default-file'

const GROUPS: Record<string, string[]> = {
  'file-type-pdf2': ['pdf'],
  'file-type-word': ['doc', 'docx', 'rtf'],
  'file-type-excel': ['xls', 'xlsx', 'xlsm'],
  'file-type-csv': ['csv', 'tsv'],
  'file-type-powerpoint': ['ppt', 'pptx'],
  'file-type-libreoffice-writer': ['odt'],
  'file-type-libreoffice-calc': ['ods'],
  'file-type-libreoffice-impress': ['odp'],
  'file-type-text': ['txt'],
  'file-type-log': ['log'],
  'file-type-markdown': ['md', 'markdown'],
  'file-type-tex': ['tex'],
  'file-type-epub': ['epub'],
  'file-type-json': ['json'],
  'file-type-yaml': ['yaml', 'yml'],
  'file-type-xml': ['xml'],
  'file-type-toml': ['toml'],
  'file-type-ini': ['ini', 'conf', 'cfg'],
  'file-type-zip': ['zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'bz2', 'xz'],
  'file-type-video': ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'],
  'file-type-audio': ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'],
  'file-type-image': [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'bmp',
    'tif',
    'tiff',
    'heic',
    'avif',
    'ico',
  ],
  'file-type-svg': ['svg'],
  'file-type-photoshop': ['psd'],
  'file-type-ai': ['ai'],
  'file-type-sketch': ['sketch'],
  'file-type-font': ['ttf', 'otf', 'woff', 'woff2'],
  'file-type-html': ['html', 'htm'],
  'file-type-css': ['css'],
  'file-type-js-official': ['js', 'mjs', 'cjs'],
  'file-type-typescript-official': ['ts', 'mts', 'cts'],
  'file-type-vue': ['vue'],
  'file-type-python': ['py'],
  'file-type-ruby': ['rb'],
  'file-type-go': ['go'],
  'file-type-rust': ['rs'],
  'file-type-java': ['java'],
  'file-type-php': ['php'],
  'file-type-swift': ['swift'],
  'file-type-shell': ['sh', 'bash', 'zsh'],
  'file-type-sql': ['sql'],
  'file-type-db': ['db', 'sqlite', 'sqlite3'],
  'file-type-cert': ['pem', 'crt', 'cer'],
  'file-type-binary': ['bin', 'exe', 'dmg', 'iso'],
}

/** Extension (lowercase, without dot) → icon name. */
export const FILE_ICON_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(GROUPS).flatMap(([icon, extensions]) =>
    extensions.map((extension) => [extension, icon]),
  ),
)

/** Every icon used, for the generator. */
export const FILE_ICON_NAMES = [DEFAULT_FILE_ICON, ...Object.keys(GROUPS)]
