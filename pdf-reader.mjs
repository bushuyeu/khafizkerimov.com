import { getDocument, GlobalWorkerOptions, TextLayer } from './pdfjs/pdf.min.mjs';

GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const pages = document.getElementById('pdf-pages');
const status = document.getElementById('reader-status');
const pageNumber = document.getElementById('page-number');
const pageCount = document.getElementById('page-count');
const zoomLevel = document.getElementById('zoom-level');
const previous = document.getElementById('previous-page');
const next = document.getElementById('next-page');
const zoomOut = document.getElementById('zoom-out');
const zoomIn = document.getElementById('zoom-in');
const fitWidth = document.getElementById('fit-width');
const download = document.getElementById('download-pdf');
const records = [];
let zoom = 1;
let current = 1;
let generation = 0;
let ready = false;

function updateControls() {
  if (document.activeElement !== pageNumber) pageNumber.value = current;
  previous.disabled = !ready || current <= 1;
  next.disabled = !ready || current >= records.length;
  zoomOut.disabled = !ready || zoom <= .6;
  zoomIn.disabled = !ready || zoom >= 2.5;
  zoomLevel.value = records.length ? Math.round(records[current - 1].scale * 100) + '%' : '—';
}

async function renderPage(record) {
  if (record.rendered || record.rendering === generation) return;
  const token = generation;
  record.rendering = token;
  const viewport = record.page.getViewport({ scale: record.scale });
  const canvas = document.createElement('canvas');
  const pixels = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(viewport.width * pixels);
  canvas.height = Math.ceil(viewport.height * pixels);
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';
  canvas.setAttribute('aria-hidden', 'true');
  const text = document.createElement('div');
  text.className = 'textLayer';
  record.element.replaceChildren(canvas, text);
  try {
    record.task = record.page.render({
      canvasContext: canvas.getContext('2d'), viewport,
      transform: pixels === 1 ? null : [pixels, 0, 0, pixels, 0, 0],
    });
    await record.task.promise;
    if (token !== generation) return;
    record.textTask = new TextLayer({
      textContentSource: record.page.streamTextContent(), container: text, viewport,
    });
    await record.textTask.render();
    if (token !== generation) return;
    record.rendered = true;
    record.element.dataset.rendered = 'true';
  } catch (error) {
    if (token !== generation || error.name === 'RenderingCancelledException' || error.name === 'AbortException') return;
    record.element.dataset.error = 'true';
    status.hidden = false;
    status.textContent = 'This page could not be displayed. You can download the PDF above.';
    console.error(error);
  } finally {
    if (token === generation) record.rendering = null;
  }
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) renderPage(records[Number(entry.target.dataset.index)]);
  }
}, { root: pages, rootMargin: '600px 0px' });

function layout(preservePosition = true) {
  if (!records.length) return;
  const anchor = records[current - 1];
  const fraction = preservePosition ? (pages.scrollTop - anchor.element.offsetTop) / Math.max(anchor.element.offsetHeight, 1) : 0;
  generation++;
  observer.disconnect();
  const available = Math.max(160, pages.clientWidth - 28);
  for (const record of records) {
    record.task?.cancel();
    record.textTask?.cancel();
    record.scale = available / record.base.width * zoom;
    const viewport = record.page.getViewport({ scale: record.scale });
    record.element.style.width = viewport.width + 'px';
    record.element.style.height = viewport.height + 'px';
    record.element.style.setProperty('--total-scale-factor', record.scale * (record.page.userUnit || 1));
    record.element.replaceChildren();
    delete record.element.dataset.rendered;
    delete record.element.dataset.error;
    record.rendered = false;
    record.rendering = null;
    observer.observe(record.element);
  }
  if (preservePosition) pages.scrollTop = anchor.element.offsetTop + fraction * anchor.element.offsetHeight;
  updateControls();
  renderPage(anchor);
}

function goToPage(value) {
  if (!ready) return;
  current = Math.min(records.length, Math.max(1, Math.round(Number(value) || 1)));
  pageNumber.value = current;
  pages.scrollTo({ top: records[current - 1].element.offsetTop - 12 });
  renderPage(records[current - 1]);
  updateControls();
}

pageNumber.addEventListener('change', () => goToPage(pageNumber.value));
pageNumber.addEventListener('keydown', event => {
  if (event.key === 'Enter') { goToPage(pageNumber.value); pageNumber.blur(); }
});
previous.addEventListener('click', () => goToPage(current - 1));
next.addEventListener('click', () => goToPage(current + 1));
zoomOut.addEventListener('click', () => { zoom = Math.max(.6, zoom - .15); layout(); });
zoomIn.addEventListener('click', () => { zoom = Math.min(2.5, zoom + .15); layout(); });
fitWidth.addEventListener('click', () => { zoom = 1; layout(); });
let scrollPending = false;
pages.addEventListener('scroll', () => {
  if (!ready || scrollPending || pages.clientWidth === 0) return;
  scrollPending = true;
  requestAnimationFrame(() => {
    scrollPending = false;
    if (pages.clientWidth === 0) return;
    const position = pages.scrollTop + 20;
    const record = records.find(item => item.element.offsetTop + item.element.offsetHeight > position);
    current = record ? record.number : records.length;
    updateControls();
  });
}, { passive: true });
let lastWidth = 0;
let resizeTimer;
new ResizeObserver(() => {
  if (pages.clientWidth === lastWidth) return;
  lastWidth = pages.clientWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (ready && lastWidth > 0) layout(); }, 100);
}).observe(pages);

try {
  const file = new URLSearchParams(location.search).get('file');
  if (!file) throw new Error('No PDF selected.');
  const url = new URL(file, location.href);
  if (url.origin !== location.origin || !url.pathname.toLowerCase().endsWith('.pdf')) throw new Error('Invalid PDF URL.');
  download.href = url.href;
  download.download = decodeURIComponent(url.pathname.split('/').pop());
  download.hidden = false;
  const documentTask = getDocument({
    url: url.href,
    standardFontDataUrl: new URL('./pdfjs/standard_fonts/', import.meta.url).href,
    wasmUrl: new URL('./pdfjs/wasm/', import.meta.url).href,
    iccUrl: new URL('./pdfjs/iccs/', import.meta.url).href,
  });
  const pdf = await documentTask.promise;
  pageNumber.max = pdf.numPages;
  pageCount.textContent = '/ ' + pdf.numPages;
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const element = document.createElement('section');
    element.className = 'pdf-page';
    element.dataset.index = number - 1;
    element.setAttribute('aria-label', 'Page ' + number);
    pages.append(element);
    records.push({ number, page, element, base: page.getViewport({ scale: 1 }), scale: 1, rendering: null });
  }
  ready = true;
  pageNumber.disabled = false;
  fitWidth.disabled = false;
  layout(false);
  await renderPage(records[0]);
  status.hidden = true;
} catch (error) {
  status.hidden = false;
  status.textContent = 'The PDF could not be opened. Please use Download PDF above, or return to Publications.';
  console.error(error);
}
