// Run before launch: node scripts/check-placeholders.js
// Lists every [[ ]] placeholder still left in your policy pages.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'data', 'policies');
let n = 0;
for (const f of fs.readdirSync(dir)) {
  fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\[\[(.+?)\]\]/g)) { n++; console.log(`${f}:${i + 1}  ${m[0]}`); }
  });
}
console.log(n ? `\n${n} placeholder(s) to fill in before launch.` : 'No placeholders left. Policies are ready.');
process.exit(n ? 1 : 0);
