// src/processors.js
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const vision = require('@google-cloud/vision');
const { extractAll, extractWithOpenAI } = require('./extract');

const hasVisionCreds = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
let visionClient = null;
if (hasVisionCreds) { try { visionClient = new vision.ImageAnnotatorClient(); } catch {} }

const IMAGE_EXT = new Set(['.jpg','.jpeg','.png','.webp','.bmp','.tif','.tiff']);
const PDF_EXT = '.pdf';

async function ocrImageWithVision(filePath) {
  if (!visionClient) return '';
  const [result] = await visionClient.textDetection(filePath);
  return result?.textAnnotations?.[0]?.description || '';
}

async function readTextFromPdf(filePath) {
  // ✅ nuevo: validar existencia y extensión
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
  if (IMAGE_EXT.has(ext)) return await ocrImageWithVision(filePath);
  if (ext === PDF_EXT) return await readTextFromPdf(filePath);
  return '';
}

async function processFolder(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  const filenames = fs.readdirSync(dirPath);
  const results = [];
  for (const name of filenames) {
    const full = path.join(dirPath, name);
    // ✅ nuevo: sólo procesa ficheros regulares
    if (!fs.statSync(full).isFile()) continue;
    const text = await readTextSmart(full);
    const regexInfo = extractAll(text || '');
    let final = { ...regexInfo };
    try {
      const ai = await extractWithOpenAI(text || '', regexInfo);
      final.invoice_number = ai.invoice_number;
      final.supplier = ai.supplier;
      final.notes = [...(regexInfo.notes||[]), ...(ai.notes||[])];
      final.confidence = Math.max(regexInfo.confidence, ai.confidence || 0);
    } catch {}
    results.push({
      file: name,
      invoice_number: final.invoice_number || null,
      supplier: final.supplier || null,
      confidence: final.confidence,
      notes: final.notes?.join('; ') || null
    });
  }
  return results;
}

module.exports = { processFolder };
