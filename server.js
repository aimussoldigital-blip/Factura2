import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { processFile } from "./src/processors.js";
import { exportExcel, exportPDF } from "./src/exporters.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: "uploads/" });

let results = [];

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index", { results });
});

app.post("/upload", upload.array("files"), async (req, res) => {
  results = [];
  for (const file of req.files) {
    const data = await processFile(file.path, file.originalname);
    results.push(data);
    fs.unlinkSync(file.path);
  }
  res.redirect("/");
});

app.get("/download/excel", (req, res) => {
  const file = exportExcel(results);
  res.download(file, "facturas.xlsx", () => fs.unlinkSync(file));
});

app.get("/download/pdf", (req, res) => {
  const file = exportPDF(results);
  res.download(file, "facturas.pdf", () => fs.unlinkSync(file));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
