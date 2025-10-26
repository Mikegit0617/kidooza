const fs   = require("fs");
const path = require("path");

const src    = path.join(process.cwd(), "src","app","api","worksheets","generate","route.ts");
const backup = path.join(process.cwd(), "src","app","api","worksheets","generate","route.backup.kidooza.ts");

function exists(p){ try { fs.accessSync(p); return true; } catch { return false; } }

if (exists(src)) {
  fs.copyFileSync(src, backup);
  console.log(` Backup saved to ${path.relative(process.cwd(), backup)}`);
} else {
  console.error(" route.ts not found  nothing to back up.");
  process.exit(1);
}
