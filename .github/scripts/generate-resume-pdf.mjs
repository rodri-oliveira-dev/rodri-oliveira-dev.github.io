// Gera as versões PDF dos currículos a partir dos HTMLs publicados.
import { chromium } from 'playwright';
import { stat, readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const resumes = [
  { language: 'pt-BR', html: 'curriculo/index.html', pdf: 'curriculo/rodrigo-de-oliveira.pdf' },
  { language: 'en', html: 'en/resume/index.html', pdf: 'en/resume/rodrigo-de-oliveira.pdf' },
  { language: 'es-419', html: 'es/curriculo/index.html', pdf: 'es/curriculo/rodrigo-de-oliveira.pdf' },
];

const browser = await chromium.launch({ headless: true });
try {
  const css = await readFile(resolve('curriculo/curriculo.css'), 'utf8');
  for (const resume of resumes) {
    const htmlPath = resolve(resume.html);
    const pdfPath = resolve(resume.pdf);
    await mkdir(dirname(pdfPath), { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      const html = await readFile(htmlPath, 'utf8');
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await page.addStyleTag({ content: css });
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
      await page.close();
    }

    const { size } = await stat(pdfPath);
    const signature = (await readFile(pdfPath)).subarray(0, 5).toString('ascii');
    if (size < 10_000 || signature !== '%PDF-') {
      throw new Error(`PDF ${resume.language} gerado está vazio ou inválido.`);
    }
    console.log(`Currículo PDF ${resume.language} gerado: ${pdfPath} (${size} bytes)`);
  }
} finally {
  await browser.close();
}
