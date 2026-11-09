// Gera a versão PDF do currículo a partir do HTML publicado.
// A única fonte de conteúdo é curriculo/index.html.
import { chromium } from 'playwright';
import { stat, readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const htmlPath = resolve('curriculo/index.html');
const pdfPath = resolve('curriculo/rodrigo-de-oliveira.pdf');

await mkdir(dirname(pdfPath), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const response = await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  if (!response?.ok()) {
    throw new Error('Não foi possível carregar o HTML do currículo.');
  }
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
    tagged: true,
    outline: true,
  });
} finally {
  await browser.close();
}

const { size } = await stat(pdfPath);
const signature = (await readFile(pdfPath)).subarray(0, 5).toString('ascii');
if (size < 10_000 || signature !== '%PDF-') {
  throw new Error('PDF gerado está vazio ou inválido.');
}
console.log(`Currículo PDF gerado: ${pdfPath} (${size} bytes)`);
