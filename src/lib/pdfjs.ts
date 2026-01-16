const PDFJS_VERSION = '4.8.69';

const PDFJS_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

let cachedPdfjs: any | null = null;

export async function loadPdfjs(): Promise<any> {
  if (cachedPdfjs) return cachedPdfjs;

  // pdfjs-dist ESM bundle loaded from CDN to avoid native optional deps (e.g. node-canvas)
  const mod: any = await import(/* @vite-ignore */ PDFJS_URL);
  const pdfjs: any = mod?.pdfjsLib ?? mod;

  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  }

  cachedPdfjs = pdfjs;
  return pdfjs;
}
