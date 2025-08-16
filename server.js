require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { processFolder } = require('./src/processors');
const { exportXlsx, exportPdf } = require('./src/exporters');

const app = express();
const PORT = process.env.PORT || 3000;             // <- Render te inyecta este puerto
const HOST = '0.0.0.0';                            // <- escuchar en todas las interfaces

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const RESULTS_DIR = path.join(__dirname, 'results');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// healthcheck para Render
app.get('/health', (_, res) => res.status(200).send('ok'));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({ storage });

app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/api/upload', upload.array('files', 100), (req, res) => {
  res.json({ ok: true, count: req.files?.length || 0 });
});

app.post('/api/process', async (req, res) => {
  try {
    const results = await processFolder(UPLOAD_DIR);
    fs.writeFileSync(path.join(RESULTS_DIR, 'results.json'), JSON.stringify(results, null, 2));
    res.json({ ok: true, results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/results', (req, res) => {
  try {
    const f = path.join(RESULTS_DIR, 'results.json');
    if (!fs.existsSync(f)) return res.json({ results: [] });
    res.json({ results: JSON.parse(fs.readFileSync(f, 'utf8')) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/export/xlsx', async (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, 'results.json'), 'utf8'));
    const out = path.join(RESULTS_DIR, 'invoices.xlsx');
    await exportXlsx(data, out);
    res.download(out, 'invoices.xlsx');
  } catch (e) { res.status(400).send('Primero procesa archivos.'); }
});

app.get('/api/export/pdf', async (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, 'results.json'), 'utf8'));
    const out = path.join(RESULTS_DIR, 'invoices.pdf');
    await exportPdf(data, out);
    res.download(out, 'invoices.pdf');
  } catch (e) { res.status(400).send('Primero procesa archivos.'); }
});

app.listen(PORT, HOST, () => {
  console.log(`Servidor en http://${HOST}:${PORT}`);
});
