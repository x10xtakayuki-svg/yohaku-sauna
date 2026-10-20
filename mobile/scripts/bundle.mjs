import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const target of ['ios/Web','android/app/src/main/assets/Web']){
  const dest=path.join(root,target);await mkdir(dest,{recursive:true});
  let html=await readFile(path.join(root,'../public/index.html'),'utf8');
  html=html.replace('<script src="app.js','<script src="native-bridge.js"></script>\n<script src="app.js');
  await writeFile(path.join(dest,'index.html'),html);
  const css=(await readFile(path.join(root,'../public/style.css'),'utf8')).replace(/@import\s+url\((?:"[^"]*"|'[^']*'|[^)]*)\)\s*;/g,'');
  await writeFile(path.join(dest,'style.css'),css);
  await copyFile(path.join(root,'../public/app.js'),path.join(dest,'app.js'));
  await copyFile(path.join(root,'shared/native-bridge.js'),path.join(dest,'native-bridge.js'));
}
console.log('Bundled offline UI for iPhone and Android.');
