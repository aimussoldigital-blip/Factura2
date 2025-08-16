import XLSX from "xlsx";
import PDFDocument from "pdfkit";
import fs from "fs";

export function exportExcel(results) {
  const ws = XLSX.utils.json_to_sheet(results);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Facturas");
  const file = "facturas.xlsx";
  XLSX.writeFile(wb, file);
  return file;
}

export function exportPDF(results) {
  const file = "facturas.pdf";
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(file));
  doc.fontSize(18).text("Reporte de Facturas", { align: "center" });
  doc.moveDown();

  results.forEach(r => {
    doc.fontSize(12).text(`Factura: ${r.nro_factura} | Proveedor: ${r.proveedor}`);
  });

  doc.end();
  return file;
}
