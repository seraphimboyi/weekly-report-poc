// 用 docxtemplater 把週報快照 JSON 套進範本，產出 .docx
// 用法：node render.js <template.docx> <data.json> <output.docx>
const fs = require("fs");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const [templatePath, dataPath, outPath] = process.argv.slice(2);

const zip = new PizZip(fs.readFileSync(templatePath));
const doc = new Docxtemplater(zip, {
  paragraphLoop: true,
  linebreaks: true, // 備註裡的換行會變成 Word 的換行
  nullGetter: () => "", // 沒填的欄位留白，不要印出 "undefined"
});

doc.render(JSON.parse(fs.readFileSync(dataPath, "utf8")));
fs.writeFileSync(outPath, doc.getZip().generate({ type: "nodebuffer" }));
console.log("wrote", outPath);
