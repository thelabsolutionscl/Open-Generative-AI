#!/usr/bin/env node
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const HTML=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function esc(value){return String(value).replace(/[.*+?^$()|[\]\\]/g,'\\$&');}
function count(re){return(HTML.match(re)||[]).length;}
function functionBlock(name){
  const re=new RegExp('(?:async\\s+)?function\\s+'+esc(name)+'\\s*\\(');
  const start=re.exec(HTML);assert.ok(start,'falta '+name);
  const tail=HTML.slice(start.index+start[0].length);
  const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.exec(tail);
  return HTML.slice(start.index,next?start.index+start[0].length+next.index:HTML.length);
}
function unique(name){assert.equal(count(new RegExp('(?:async\\s+)?function\\s+'+esc(name)+'\\s*\\(','g')),1,name+' debe existir una vez');}

test('JavaScript inline de OpenGen mantiene sintaxis válida',()=>{
  const scripts=[...HTML.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)];
  assert.ok(scripts.length,'falta script principal');
  for(const [,code] of scripts)assert.doesNotThrow(()=>new Function(code));
});

test('OpenGen conserva las siete herramientas y controles operativos',()=>{
  for(const sec of ['t2i','edit','i2v','t2v','vfx','audio','upscale']){
    assert.ok(HTML.includes('data-sec="'+sec+'"')||HTML.includes("data-sec='"+sec+"'"),'falta sección '+sec);
    assert.match(HTML,new RegExp('\\b'+sec+'\\s*:\\s*\\['));
  }
  for(const id of ['gen-btn','prompt-ta','upload-zone','file-input','url-input','result-content','hist-panel','hist-list','rights-confirm','cost-status','key-btn'])
    assert.equal((HTML.match(new RegExp('id=(?:"|\\x27)'+id+'(?:"|\\x27)','g'))||[]).length,1,id);
  assert.doesNotMatch(HTML,/id=["']modal-input["']|API Key de MuAPI/);
});

test('funciones críticas existen una sola vez',()=>{
  ['switchSection','buildModelStrip','updateGenBtn','handleFileInput','handleDrop','readFile','clearUpload',
   'compressImage','uploadImageForAPI','hostRpc','safeHttpsUrl','generate','cancelGeneration','sleep',
   'setResultError','setResultMedia','addToHistory','renderHistory','selectHistory'].forEach(unique);
});

test('credencial, prompts e imágenes ya no salen a corsproxy ni al proveedor desde Pages',()=>{
  assert.doesNotMatch(HTML,/corsproxy\.io|api\.muapi\.ai|x-api-key/i);
  assert.doesNotMatch(HTML,/\blet\s+apiKey\b|localStorage|sessionStorage/);
  assert.doesNotMatch(HTML,/uploadToImgbb|temp_free|api\.imgbb\.com/);
  const upload=functionBlock('uploadImageForAPI'),gen=functionBlock('generate');
  assert.match(upload,/hostRpc\(\s*['"]upload['"]/);
  assert.match(gen,/hostRpc\(\s*['"]generate['"]/);
  assert.match(gen,/hostRpc\(\s*['"]poll['"]/);
  assert.match(functionBlock('hostRpc'),/https:\/\/proxy\.thelab\.solutions\/visual-ai\/rpc/);
});

test('postMessage está versionado y limitado al dashboard exacto',()=>{
  assert.match(HTML,/HOST_ORIGIN=['"]https:\/\/dashboard\.thelab\.solutions['"]/);
  assert.match(HTML,/PROTOCOL_VERSION=1/);
  assert.match(HTML,/event\.origin!==HOST_ORIGIN/);
  assert.match(HTML,/event\.source!==window\.parent/);
  assert.match(HTML,/source:'opengen'/);
  assert.match(HTML,/source!==['"]tls-dashboard['"]/);
  assert.match(HTML,/type:['"]ready['"]/);
  assert.match(HTML,/job-start|job-progress|job-complete|job-error|asset-selected/);
});

test('archivos locales validan MIME, extensión, firma, peso y dimensiones',()=>{
  const read=functionBlock('readFile');
  assert.match(read,/image\/jpeg/);assert.match(read,/image\/png/);assert.match(read,/image\/webp/);
  assert.match(read,/8\*1024\*1024/);
  assert.match(read,/jpe\?g\|png\|webp/);
  assert.match(read,/0xff/);assert.match(read,/RIFF/);assert.match(read,/WEBP/);
  assert.match(read,/8192/);assert.match(read,/32_000_000/);assert.match(read,/createImageBitmap/);
});

test('URLs de entrada/resultados exigen HTTPS y política explícita',()=>{
  const safe=functionBlock('safeHttpsUrl'),input=functionBlock('allowedInputUrl');
  assert.match(safe,/protocol!==['"]https:['"]/);
  assert.match(safe,/localhost/);assert.match(safe,/RESULT_HOST_SUFFIXES/);
  assert.match(input,/jpe\?g\|png\|webp/);
  assert.match(HTML,/muapi\.ai.*fal\.media.*replicate\.delivery.*cloudfront\.net.*amazonaws\.com/s);
});

test('cada job congela sección/modelo/parámetros y es cancelable',()=>{
  const gen=functionBlock('generate'),section=functionBlock('switchSection'),cancel=functionBlock('cancelGeneration');
  assert.match(gen,/const\s+section=currentSection/);
  assert.match(gen,/const\s+snap=\{/);
  assert.match(gen,/new\s+AbortController\(\)/);
  assert.match(gen,/snap\.vidRatio/);assert.match(gen,/snap\.duration/);assert.match(gen,/snap\.resolution/);
  assert.match(section,/if\(generating&&sec!==currentSection\)/);
  assert.match(cancel,/\.abort\(\)/);
  assert.match(gen,/sec:section/);
});

test('polling usa backoff, timeout total y reintenta solo errores transitorios',()=>{
  const gen=functionBlock('generate'),sleep=functionBlock('sleep');
  assert.match(gen,/4\*60\*1000/);
  assert.match(gen,/delay=Math\.min\(8000/);
  assert.match(gen,/err\.transient\|\|err\.status===502/);
  assert.match(sleep,/signal\.addEventListener\(['"]abort['"]/);
});

test('resultados y errores remotos se construyen con DOM seguro',()=>{
  for(const name of ['setResultError','setResultMedia','renderHistory']){
    const body=functionBlock(name);
    assert.doesNotMatch(body,/\.innerHTML\s*=/,name+' no debe usar innerHTML');
    assert.match(body,/createElement|replaceChildren/,name+' debe construir DOM');
  }
  const media=functionBlock('setResultMedia');
  assert.match(media,/safeHttpsUrl/);
  assert.match(media,/rel=['"]noopener noreferrer['"]/);
  assert.match(media,/asset-selected/);
});

test('cuota, duración/costo y confirmación de operaciones costosas son visibles',()=>{
  const gen=functionBlock('generate'),media=functionBlock('setResultMedia');
  assert.match(HTML,/Cuota diaria segura/);
  assert.match(gen,/created\.quota/);
  assert.match(gen,/info\.isVid\|\|info\.isAudio/);
  assert.match(gen,/confirm\(/);
  assert.match(media,/Generado en/);
  assert.match(media,/costo proveedor|costo real no reportado/);
});

test('privacidad y derechos de uso bloquean generación hasta confirmación',()=>{
  const update=functionBlock('updateGenBtn'),gen=functionBlock('generate');
  assert.match(HTML,/Confirmo que tengo permiso/);
  assert.match(update,/rights/);
  assert.match(gen,/rights-confirm/);
  assert.match(gen,/Confirma los derechos y permisos/);
});

test('historial está declarado como temporal de sesión',()=>{
  assert.match(HTML,/Historial de esta sesión/);
  const add=functionBlock('addToHistory'),render=functionBlock('renderHistory');
  assert.match(add,/history\.unshift/);
  assert.match(render,/Sin historial en esta sesión/);
  assert.doesNotMatch(HTML,/localStorage\.setItem\([^)]*hist|indexedDB/i);
});

test('OpenGen aplica CSP, Referrer-Policy y Permissions-Policy',()=>{
  assert.match(HTML,/Content-Security-Policy/);
  assert.match(HTML,/connect-src https:\/\/proxy\.thelab\.solutions/);
  assert.match(HTML,/object-src 'none'/);
  assert.match(HTML,/name=["']referrer["'][^>]*no-referrer/);
  assert.match(HTML,/Permissions-Policy/);
  assert.match(HTML,/camera=\(\).*microphone=\(\)/);
});

test('no existe una credencial literal de proveedor en el archivo público',()=>{
  assert.doesNotMatch(HTML,/\bmu_[A-Za-z0-9_-]{12,}\b|\bhf_[A-Za-z0-9_-]{12,}\b/);
});
