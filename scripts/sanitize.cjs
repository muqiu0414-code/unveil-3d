const fs = require("fs");
const p = "D:\\Desktop\\rep\\unveil-3d\\src\\data-full.ts";
let s = fs.readFileSync(p, "utf8");
// strip unicode line separators / paragraph separators inside strings
s = s.replace(/\u2028/g, " ").replace(/\u2029/g, " ");
// trim trailing space in titles like "Spells "
s = s.replace(/"Spells ", slug/g, '"Spells", slug');
fs.writeFileSync(p, s, "utf8");
console.log("sanitized, has U+2028:", s.includes("\u2028"));
