const fs = require('fs');
let c = fs.readFileSync('services/deepThink/organizational/prompts.ts', 'utf8');
c = c.replace(/\\`/g, '`');
c = c.replace(/\\\$/g, '$');
fs.writeFileSync('services/deepThink/organizational/prompts.ts', c);
