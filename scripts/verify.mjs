import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
for(const task of ['typecheck','test'])if(p.scripts[task])execFileSync('pnpm',['run',task],{stdio:'inherit',env:{...process.env,CI:'true',NODE_ENV:'test'}});
