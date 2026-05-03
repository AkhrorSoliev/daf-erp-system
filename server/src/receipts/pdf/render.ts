import * as path from 'path';
import * as fs from 'fs';
// pdfmake v0.2 exports the `PdfPrinter` class directly from its main entry.
// We still use require() because the named-import shape is awkward for a
// default-exported function class.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake');
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

// Resolve `assets/fonts` relative to BOTH dev (src/...) and prod (dist/src/...).
// Walk up from __dirname until we find an `assets/fonts` directory.
function resolveAssetsRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'assets', 'fonts');
    if (fs.existsSync(candidate)) return path.dirname(candidate);
    dir = path.dirname(dir);
  }
  // Fallback to the repo-relative path used in dev.
  return path.resolve(__dirname, '..', '..', '..', 'assets');
}

const ASSETS_ROOT = resolveAssetsRoot();
const FONT_DIR = path.join(ASSETS_ROOT, 'fonts');
const LOGO_PATH = path.join(ASSETS_ROOT, 'img', 'daf-logo.png');

// Inter is the same family used in the web UI — keeps print + screen visually
// consistent. Latin subset covers Uzbek-Latin perfectly.
const fonts = {
  Inter: {
    normal: path.join(FONT_DIR, 'Inter-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Inter-Bold.ttf'),
    italics: path.join(FONT_DIR, 'Inter-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'Inter-BoldItalic.ttf'),
  },
};

const printer = new PdfPrinter(fonts);

// Logo is read once at module load and reused as a base64 PNG in the doc def.
let cachedLogoDataUrl: string | null = null;
export function getCompanyLogoDataUrl(): string | null {
  if (cachedLogoDataUrl !== null) return cachedLogoDataUrl;
  try {
    const buf = fs.readFileSync(LOGO_PATH);
    cachedLogoDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    return cachedLogoDataUrl;
  } catch {
    cachedLogoDataUrl = '';
    return null;
  }
}

// Payment-provider logos (Payme, Click, Uzum). Read once and cached.
const providerLogoCache = new Map<string, string>();
export function getProviderLogoDataUrl(
  filename: 'payme-logo.png' | 'click-logo.png' | 'uzum-logo.png',
): string | null {
  const cached = providerLogoCache.get(filename);
  if (cached !== undefined) return cached || null;
  try {
    const p = path.join(ASSETS_ROOT, 'img', filename);
    const buf = fs.readFileSync(p);
    const url = `data:image/png;base64,${buf.toString('base64')}`;
    providerLogoCache.set(filename, url);
    return url;
  } catch {
    providerLogoCache.set(filename, '');
    return null;
  }
}

/**
 * Render a pdfmake doc-definition to a single Buffer. Streams the PDF
 * doc to a buffer-collecting array and resolves once the doc emits 'end'.
 */
export async function renderPdf(
  docDefinition: TDocumentDefinitions,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (c: Buffer) => chunks.push(c));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}
