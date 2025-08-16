export function extractInvoiceNumber(text) {
  const regex = /\b(FAC|FV|INV|BILL)[-\s:]?([A-Z0-9\-\/\.]{3,20})\b/i;
  const match = text.match(regex);
  return match ? match[0] : "No encontrado";
}

export function extractSupplier(text) {
  const suppliers = ["MERCADONA", "CARREFOUR", "LIDL", "OUIGO", "MAKRO"];
  for (const s of suppliers) {
    if (text.toUpperCase().includes(s)) return s;
  }
  return "No encontrado";
}
