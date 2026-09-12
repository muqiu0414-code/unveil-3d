// Generate src/data-full.ts from parsed source project data
const fs = require("fs");
const path = require("path");

const src = JSON.parse(fs.readFileSync("D:\\Desktop\\rep\\unveil-site\\_src\\_projects2.json", "utf8"));

function slugify(s) {
  return (s || "untitled").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

const lines = [];
lines.push("// ============================================================");
lines.push("// Full project index — all 43 projects from unveil.fr");
lines.push("// Generated from source data (DatoCMS payload)");
lines.push("// ============================================================");
lines.push("");
lines.push("export interface ProjectFull {");
lines.push("  id: number;");
lines.push("  title: string;");
lines.push("  slug: string;");
lines.push("  year: string;");
lines.push("  tags: string[];");
lines.push("  desc: string;");
lines.push("  image: string;");
lines.push("}");
lines.push("");
lines.push("export const ALL_PROJECTS: ProjectFull[] = [");

src.forEach((p, i) => {
  const img = "img/idx/" + i.toString().padStart(2, "0") + "_" + slugify(p.slug) + ".webp";
  const desc = (p.seoDesc || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const title = p.title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  lines.push(
    `  { id: ${i}, title: "${title}", slug: "${p.slug}", year: "${p.year}", tags: [${p.tags.map((t) => `"${t}"`).join(", ")}], desc: "${desc}", image: "${img}" },`
  );
});
lines.push("];");
lines.push("");

fs.writeFileSync(path.join("D:\\Desktop\\rep\\unveil-3d", "src", "data-full.ts"), lines.join("\n"), "utf8");
console.log("written", src.length, "projects");
