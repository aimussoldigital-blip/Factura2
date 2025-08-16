// src/extract.js (regex + heurística + combinación con OpenAI)
const { OpenAI } = require('openai');


const apiKey = process.env.OPENAI_API_KEY;
const client = new OpenAI({ apiKey });

/* ---------- Normalización y patrones ---------- */
function normalize(s) {
  if (!s) return '';
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
}

const INVALID_INVOICE_WORDS = [
  'CLIENTE','CUSTOMER','DESTINATARIO','FECHA','DATE','TEL','TFNO','PHONE','MOVIL','WHATSAPP','FAX',
  'EMAIL','CORREO','DIRECCION','ADDRESS','CIF','NIF','VAT','IVA','IBAN','CUENTA','ACCOUNT','ALBARAN','TICKET','PEDIDO','ORDER','REFERENCIA'
];
const INVOICE_CONTEXT_WORDS = ['FACTURA','FAC','INVOICE','FACTURE','BILL','Nº','N°','NO','NUMERO','NÚMERO','#'];

const INVOICE_PATTERNS = [
  /\b(?:FACT(?:URA)?\.?\s*(?:N[ºo°]\s*)?\.?\s*)([A-Z0-9][A-Z0-9\-\/.]{3,20})\b/ig,
  /\b([A-Z]{1,4}[-/]\d{4,12})\b/ig,
  /\b([A-Z]{2,5}\d{3,12})\b/ig,
  /\b(FV[-/]?\d{1,3}[-/]?\d{4,12})\b/ig,
  /\b([A-Z]\d{7,15})\b/ig,
  /\b([A-Z0-9]{1,4}[-/][A-Z0-9]{1,4}[-/][A-Z0-9]{3,12})\b/ig,
  /\b(\d{7,12})\b/ig,
  /\b(\d{4}[-/]\d{6,10})\b/ig
];
const CIF_NIF_PATTERNS = [/^\d{8}[A-Z]$/i, /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/i];

function looksLikePhone(candidate, ctx) {
  const ctxN = normalize(ctx);
  if (/^\+?\d[\d\s\-]{8,15}$/.test(candidate)) return true;
  if (/^\d{9,11}$/.test(candidate) && /(TEL|TFNO|PHONE|MOVIL|WHATSAPP|FAX)/.test(ctxN)) return true;
  return false;
}
function looksLikeCIFNIF(cand){ return CIF_NIF_PATTERNS.some(rx => rx.test(cand)); }

function scoreInvoiceNumber(candidate, context='') {
  if (!candidate) return 0;
  const ctx = normalize(context), cand = candidate.trim();
  let score = 0;
  if (INVOICE_CONTEXT_WORDS.some(w => ctx.includes(w))) score += 12;
  if (looksLikePhone(cand, ctx)) return 0;
  if (looksLikeCIFNIF(cand)) return 0;
  if (INVALID_INVOICE_WORDS.some(w => normalize(cand).includes(w))) return 0;

  if (/^[A-Z]+[-/]?\d+$/.test(cand)) score += 6;
  if (/^\d{7,}$/.test(cand)) { score += 2; if (!INVOICE_CONTEXT_WORDS.some(w => ctx.includes(w))) score -= 8; }
  if (/[-/.]/.test(cand)) score += 2;
  if (/[A-Za-z]/.test(cand)) score += 2;
  if (cand.length < 4 || cand.length > 25) score -= 4;
  return score;
}

/* ---------- Proveedor ---------- */
const KNOWN_SUPPLIERS_MAP = {
  'OUIGO':'OUIGO ESPAÑA S.A.U.','SUPRACAFE':'SUPRACAFE','MERCADONA':'MERCADONA S.A.',
  'CARREFOUR':'CARREFOUR','MAKRO':'MAKRO','DIA':'DIA S.A.','LIDL':'LIDL','EROSKI':'EROSKI','EHOSA':'EHOSA','COCA COLA':'COCA-COLA'
};

function extractInvoiceNumber(text) {
  if (!text) return null;
  const candidates = [];
  for (const rx of INVOICE_PATTERNS) {
    let m; while ((m = rx.exec(text)) !== null) {
      const cand = m[1] || m[0];
      const start = Math.max(0, m.index - 60), end = Math.min(text.length, rx.lastIndex + 60);
      const s = scoreInvoiceNumber(cand, text.slice(start, end));
      if (s > 0) candidates.push([cand.trim(), s]);
    }
  }
  const lines = text.split(/\r?\n/);
  for (let i=0;i<lines.length;i++) {
    const ln = normalize(lines[i]);
    if (INVOICE_CONTEXT_WORDS.some(w => ln.includes(w))) {
      const neigh = [lines[i], lines[i+1]||''];
      for (const sline of neigh) {
        let m; const rx = /[A-Z0-9][A-Z0-9\-/.]{3,20}/g;
        while ((m = rx.exec(sline)) !== null) {
          const cand = m[0], s = scoreInvoiceNumber(cand, lines[i]);
          if (s > 0) candidates.push([cand.trim(), s]);
        }
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a,b)=>b[1]-a[1]);
  return candidates[0][0];
}

function extractSupplier(text) {
  if (!text) return null;
  const tN = normalize(text);
  for (const [k,v] of Object.entries(KNOWN_SUPPLIERS_MAP)) if (tN.includes(normalize(k))) return v;

  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const skip = ['FACTURA','INVOICE','FECHA','DATE','CLIENTE','CUSTOMER','DESTINATARIO','TEL','TFNO','PHONE','EMAIL','DIRECCION','ADDRESS','CIF','NIF','VAT','IVA','IBAN','CUENTA','TOTAL','BASE','HTTP','WWW'];
  const corpRxs = [
    /\b([A-ZÁÉÍÓÚÑ0-9&.\-\s]{2,}?S\.?A\.?U?)\b/i,
    /\b([A-ZÁÉÍÓÚÑ0-9&.\-\s]{2,}?S\.?L\.?U?)\b/i,
    /\b([A-ZÁÉÍÓÚÑ0-9&.\-\s]{2,}?LIMITADA)\b/i,
    /\b([A-ZÁÉÍÓÚÑ0-9&.\-\s]{2,}?GMBH)\b/i,
    /\b([A-ZÁÉÍÓÚÑ0-9&.\-\s]{2,}?SAS)\b/i,
    /\b([A-ZÁÉÍÓÚÑ0-9&.\-\s]{2,}?LTD)\b/i
  ];
  for (const line of lines.slice(0,35)) {
    const u = normalize(line);
    if (skip.some(t=>u.includes(t))) continue;
    for (const rx of corpRxs) {
      const m = line.match(rx);
      if (m) {
        const cand = m[1].replace(/\s+/g,' ').replace(/[-.,]+$/,'').trim();
        return cand.length>60 ? cand.slice(0,60)+'...' : cand;
      }
    }
    if (u.length>=4 && u.length<=60 && /^[A-ZÁÉÍÓÚÑ0-9&\-. \s]+$/.test(u) && !/(CALLE|AVDA|C\/|€|EUROS?|IVA|FECHA|TEL)/.test(u))
      return line;
  }
  return null;
}

function scoreConfidence(text, invoiceNumber, supplier) {
  let score = 0.5;
  if (invoiceNumber) score += 0.25;
  if (supplier) score += 0.25;
  if (invoiceNumber && /factura|invoice/i.test(text)) score += 0.1;
  return Math.min(0.99, score);
}

function extractAll(text) {
  const inv = extractInvoiceNumber(text||'');
  const sup = extractSupplier(text||'');
  const confidence = scoreConfidence(text||'', inv, sup);
  const notes = [];
  if (!text || text.length < 30) notes.push('Texto muy corto (posible PDF escaneado).');
  if (!inv) notes.push('No se detectó número de factura.');
  if (!sup) notes.push('No se detectó proveedor.');
  return { invoice_number: inv || null, supplier: sup || null, confidence, notes };
}

/* ---------- Refuerzo con OpenAI ---------- */
async function extractWithOpenAI(text, fallback) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.openai_api_key || process.env.OPENAI_KEY;
  if (!apiKey) return { ...fallback, notes: [...(fallback.notes||[]), 'OpenAI no configurado.'] };

  const client = new OpenAI({ apiKey });
  const lines = (text||'').split(/\r?\n/).filter(l=>l.trim()).slice(0,80).join('\n');
  const prompt = `Devuelve SOLO JSON con claves "nro_factura" y "proveedor" basándote en el texto de una factura española.
Reglas: no uses NIF/CIF, teléfono, fecha o IBAN como número de factura; si no hay dato, usa "No encontrado".
Texto:
${lines}
Respuesta JSON:`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Devuelve solo JSON válido." }, { role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 200
    });
    let content = completion.choices[0].message.content.trim();
    content = content.replace(/^```json/i,'').replace(/```$/,'');
    const data = JSON.parse(content);

    const aiInv = data.nro_factura || null;
    const aiSup = data.proveedor || null;

    // elegir el mejor número con scoring
    const sRegex = scoreInvoiceNumber(fallback.invoice_number||'', text||'');
    const sAI = scoreInvoiceNumber(aiInv||'', text||'');
    const chosenInv = (aiInv && (sAI >= sRegex)) ? aiInv : (fallback.invoice_number || aiInv || null);
    const chosenSup = aiSup || fallback.supplier || null;

    return {
      invoice_number: chosenInv,
      supplier: chosenSup,
      confidence: scoreConfidence(text||'', chosenInv, chosenSup),
      notes: [...(fallback.notes||[]), 'Combinado con OpenAI']
    };
  } catch (e) {
    return { ...fallback, notes: [...(fallback.notes||[]), 'OpenAI falló o JSON inválido.'] };
  }
}

module.exports = { extractAll, extractWithOpenAI };
