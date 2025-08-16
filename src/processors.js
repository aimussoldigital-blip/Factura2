// src/processors.js (lee PDFs, combina regex + OpenAI)
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { extractAll, extractWithOpenAI } = require('./extract');

const PDF_EXT = '.pdf';

async function readTextFromPdf(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  if (path.extname(filePath).toLowerCase() !== PDF_EXT) return '';
  try {
    const data = await pdfParse(fs.readFileSync(filePath));
    return (data.text || '').trim();
  } catch (e) {
    console.warn('pdf-parse falló:', e.message);
    return '';
  }
}

async function processFolder(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  const filenames = fs.readdirSync(dirPath);
  const results = [];

  for (const name of filenames) {
    const full = path.join(dirPath, name);
    if (!fs.statSync(full).isFile()) continue;

    const text = await readTextFromPdf(full);
    const regexInfo = extractAll(text || '');
    let final = { ...regexInfo };

    try {
      const ai = await extractWithOpenAI(text || '', regexInfo);
      final = { ...final, ...ai, notes: ai.notes };
    } catch (_) {
      final.notes = [...(final.notes||[]), 'OpenAI no disponible o error.'];
    }

    results.push({
      file: name,
      invoice_number: final.invoice_number || null,
      supplier: final.supplier || null,
      confidence: final.confidence || 0,
      notes: final.notes?.join ? final.notes.join('; ') : final.notes
    });
  }
  return results;
}

module.exports = { processFolder };

