import {createRequire} from 'node:module';

// Vite 8's Windows SSR runner can inline CommonJS or misresolve a C:/ importer.
// Load the same installed React/Zustand packages with Node, without product config changes.
export function nativeSsrPackages(packageUrl=new URL('../package.json',import.meta.url)){
 const require=createRequire(packageUrl),prefix='\0qa-native:';
 return {name:'qa-native-package-loader',enforce:'pre',resolveId(id){if(/^(react|react-dom|zustand|xlsx)(\/|$)/.test(id))return prefix+id;},load(id){
  if(!id.startsWith(prefix))return;
  const name=id.slice(prefix.length),exports=Object.keys(require(name)).filter(key=>/^[A-Za-z_$][\w$]*$/.test(key)&&key!=='default');
  return `import {createRequire} from 'node:module';const original=createRequire(${JSON.stringify(String(packageUrl))})(${JSON.stringify(name)});export default original;${exports.map(key=>`export const ${key}=original.${key};`).join('')}`;
 }};
}
