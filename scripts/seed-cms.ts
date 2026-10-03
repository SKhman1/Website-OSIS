import fs from 'node:fs';
import { validateContent } from '../src/lib/cms-content';
const seed=validateContent(JSON.parse(fs.readFileSync('dist-pages/content-seed.json','utf8')));
fs.mkdirSync('data',{recursive:true});
const value=JSON.stringify(seed).replaceAll("'","''");
// INSERT OR IGNORE preserves all edits on subsequent builds and deployments.
fs.writeFileSync('data/cms-seed.sql',`INSERT OR IGNORE INTO cms_state(id,version,draft,published,published_version,updated_at) VALUES(1,0,'${value}','${value}',0,${Math.floor(Date.now()/1000)});\n`);
console.log('Validated initial content; data/cms-seed.sql ready. Existing content is preserved.');
