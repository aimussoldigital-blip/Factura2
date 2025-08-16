// src/processors.js
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Carga OPCIONAL de Google Vision (solo si está instalada y hay credenciales)
let visionClient = null;
try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Requerir dentro del try para no romper si no está instalada
    // npm i @google-cloud/vision  (si vas a usar OCR de imágenes / PDFs escaneados)
    const vision = require('@google-cloud/vision');
    visionClient = new vision.ImageAnnotatorClient();
  }
} catch (e) {
  console.warn('Vision no disponible (seguimos sin OCR de imágenes):', e.message);
}

const { extractAll, extractWithOpenAI } = require('./extract');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff']);
const PDF_EXT = '.pdf';

/* ---------------------------- Helpers OCR/Text ---------------------------- */

async function ocrImageWithVision(filePath) {
  if (!visionClient) return '';
  try {
    const [result] = await visionClient.textDetection(filePath);
    return result?.textAnnotations?.[0]?.description || '';
  } catch (e) {
    console.warn('OCR imagen falló:', e.message);
    return '';
  }
}

async function readTextFromPdf(filePath) {
  // Validaciones defensivas para evitar ENOENT/streams vacíos
  if (!filePath || !fs.existsSync(filePath)) return '';
  if (path.extname(filePath).toLowerCase() !== PDF_EXT) return '';
  try {
    const dataBuffer = fs.readFileSync(filePath);
    if (!dataBuffer || !dataBuffer.length) return '';
    const data = await pdfParse(dataBuffer);
    return (data.text || '').trim();
  } catch (e) {
    console.warn('pdf-parse falló en', filePath, e.message);
    return '';
  }
}

async function readTextSmart(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  const ext = path.extname(filePath).toLowerCase();

  if (IMAGE_EXT.has(ext)) {
    // Si no hay Vision configurado, devolvemos vacío (no rompemos)
    return await ocrImageWithVision(filePath);
  }
  if (ext === PDF_EXT) {
    return await readTextFromPdf(filePath);
  }
  return '';
}

/* ----------------------------- Procesamiento ----------------------------- */

async function processFolder(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];

  const filenames = fs.readdirSync(dirPath);
  const results = [];

  for (const name of filenames) {
    const full = path.join(dirPath, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    // Lee texto del archivo (PDF con texto o imagen con Vision si disponible)
    const text = await readTextSmart(full);

    // Extracción por regex/heurística
    const regexInfo = extractAll(text || '');
    let final = { ...regexInfo };

    // Combina con OpenAI si está configurado (extractWithOpenAI ya maneja la ausencia de API key)
    try {
      const ai = await extractWithOpenAI(text || '', regexInfo);
      final.invoice_number = ai.invoice_number;
      final.supplier = ai.supplier;
      final.confidence = Math.max(regexInfo.confidence || 0, ai.confidence || 0);
      final.notes = [...(regexInfo.notes || []), ...(ai.notes || [])];
    } catch (e) {
      // Si falla OpenAI, seguimos con regexInfo
      final.notes = [...(regexInfo.notes || []), 'OpenAI no disponible o error.'];
    }

    results.push({
      file: name,
      invoice_number: final.invoice_number || null,
      supplier: final.supplier || null,
      confidence: final.confidence || 0,
      notes: final.notes?.join('; ') || null
    });
  }

  return results;
}

module.exports = { processFolder };

