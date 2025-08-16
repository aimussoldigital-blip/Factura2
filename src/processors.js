import fs from "fs";
import pdf from "pdf-parse";
import { extractInvoiceNumber, extractSupplier } from "./extract.js";

export async function processFile(filePath, fileName) {
  let text = "";

  if (filePath.toLowerCase().endsWith(".pdf")) {
    const data = await pdf(fs.readFileSync(filePath));
    text = data.text;
  } else {
    text = fileName; // Aquí luego conectamos OCR
  }

  const nro_factura = extractInvoiceNumber(text);
  const proveedor = extractSupplier(text);

  return { nro_factura, proveedor };
}
