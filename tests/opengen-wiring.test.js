#!/usr/bin/env node
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const HTML=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function esc(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function count(re){return(HTML.match(re)||[]).length;}
function functionBlock(name){
  const re=new RegExp(`(?:async\\s+)?function\\s+${esc(name)}\\s*\\(`);
  const start=re.exec(HTML);
  assert.ok(start,`falta ${name}`);
  const tail=HTML.slice(start.index+start[0].length);
  const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.exec(tail);
  return HTML.slice(start.index,next?start.index+start[0].length+next.index:HTML.length);
}
function unique(name){
  assert.equal(count(new RegExp(`(?:async\\s+)?function\\s+${esc(name)}\\s*\\(`,'g')),1,`${name} debe existir una vez`);
}

test('OpenGen mantiene las siete áreas visuales y sus controles principales',()=>{
  for(const sec of ['t2i','edit','i2v','t2v','vfx','audio','upscale']){
    assert.match(HTML,new RegExp(`data-sec=["']${sec}["']`),`falta sección ${sec}`);
    assert.match(HTML,new RegExp(`\\b${sec}\\s*:\\s*\\[`),`falta catálogo de modelos ${sec}`);
  }
  for(const id of ['gen-btn','prompt-ta','upload-zone','file-input','url-input','result-content','hist-panel','hist-list','modal-overlay','modal-input']){
    assert.equal(count(new RegExp(`id=["']${id}["']`,'g')),1,`${id} debe existir una vez`);
  }
});

test('las funciones críticas no están redefinidas',()=>{
  [
    'switchSection','buildModelStrip','onPromptInput','updateGenBtn','handleFileInput','handleDrop','readFile','clearUpload',
    'compressImage','uploadImageForAPI','generate','setProgress','setResultLoading','setResultError','setResultMedia',
    'addToHistory','renderHistory','selectHistory','openModal','saveKey','deleteKey'
  ].forEach(unique);
});

test('la API key permanece solo en memoria de la sesión',()=>{
  assert.match(HTML,/let\s+apiKey\s*=\s*['"]["']/);
  const save=functionBlock('saveKey');
  const del=functionBlock('deleteKey');
  assert.match(save,/apiKey\s*=\s*v/);
  assert.match(del,/apiKey\s*=\s*['"]["']/);
  assert.doesNotMatch(save,/localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(del,/localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test('el botón generar exige clave, prompt/imagen y bloquea concurrencia básica',()=>{
  const update=functionBlock('updateGenBtn');
  const gen=functionBlock('generate');
  assert.match(update,/generating\s*\|\|\s*!hasPrompt\s*\|\|\s*!hasImg/);
  assert.match(gen,/if\s*\(\s*!apiKey\s*\)/);
  assert.match(gen,/generating\s*=\s*true/);
  assert.match(gen,/finally/);
  assert.match(gen,/generating\s*=\s*false/);
});

test('las imágenes locales se comprimen y suben antes de enviarse al modelo',()=>{
  const upload=functionBlock('uploadImageForAPI');
  const gen=functionBlock('generate');
  assert.match(upload,/compressImage\s*\(/);
  assert.match(upload,/new\s+File\s*\(/);
  assert.match(upload,/FormData/);
  assert.match(upload,/upload_file/);
  assert.match(gen,/uploadedImageUrl\.startsWith\(\s*['"]data:/);
  assert.match(gen,/await\s+uploadImageForAPI\s*\(/);
});

test('la generación crea una solicitud, consulta estado y distingue éxito/fallo/timeout',()=>{
  const gen=functionBlock('generate');
  assert.match(gen,/api\.muapi\.ai\/api\/v1/);
  assert.match(gen,/request_id/);
  assert.match(gen,/while\s*\(\s*attempts\s*<\s*90\s*\)/);
  assert.match(gen,/predictions\/\$\{reqId\}\/result/);
  assert.match(gen,/completed|succeeded/);
  assert.match(gen,/failed|error/);
  assert.match(gen,/Tiempo de espera agotado/);
  assert.match(gen,/addToHistory\s*\(/);
});

test('cada resultado conserva tipo, modelo, prompt y momento de generación',()=>{
  const gen=functionBlock('generate');
  assert.match(gen,/const\s+item\s*=\s*\{\s*url\s*,\s*type\s*,\s*model\s*:\s*model\.name\s*,\s*sec\s*:\s*currentSection\s*,\s*prompt\s*,\s*time\s*:\s*Date\.now\(\)/);
  const result=functionBlock('setResultMedia');
  assert.match(result,/<video/);
  assert.match(result,/<audio/);
  assert.match(result,/<img/);
  assert.match(result,/download/);
});

test('el historial permite volver a abrir resultados durante la sesión',()=>{
  const add=functionBlock('addToHistory');
  const render=functionBlock('renderHistory');
  const select=functionBlock('selectHistory');
  assert.match(add,/history\.unshift\s*\(/);
  assert.match(add,/renderHistory\s*\(/);
  assert.match(render,/history\.map\s*\(/);
  assert.match(select,/setResultMedia\s*\(\s*history\[i\]\s*\)/);
});

test('los modelos y parámetros se capturan antes de crear la solicitud',()=>{
  const gen=functionBlock('generate');
  assert.match(gen,/selectedModel\[currentSection\]/);
  assert.match(gen,/body\.prompt\s*=\s*prompt/);
  assert.match(gen,/body\.aspect_ratio/);
  assert.match(gen,/body\.duration/);
  assert.match(gen,/body\.resolution/);
  assert.match(gen,/IMAGE_FIELDS/);
});

test('no existe una API key literal de MuAPI o Hugging Face en el archivo público',()=>{
  assert.doesNotMatch(HTML,/\bmu_[A-Za-z0-9_-]{12,}\b/);
  assert.doesNotMatch(HTML,/\bhf_[A-Za-z0-9_-]{12,}\b/);
});

test.todo('la API key, prompts e imágenes deben pasar por un backend propio y nunca por corsproxy.io');
test.todo('setResultError, setResultMedia y renderHistory deben construir DOM seguro y validar URLs, no interpolar respuestas remotas en innerHTML');
test.todo('readFile debe validar MIME real, extensión, dimensiones y tamaño máximo antes de FileReader');
test.todo('handleUrlInput debe aceptar solo HTTPS y una política explícita de hosts/tipos de imagen');
test.todo('generate debe congelar sección/modelo/parámetros al inicio y usar AbortController para cancelar o evitar resultados cruzados');
test.todo('el polling debe comprobar HTTP, usar backoff/reintentos y distinguir errores transitorios');
test.todo('la interfaz debe mostrar costo estimado, saldo/cuota y pedir confirmación para generaciones costosas');
test.todo('el historial debe indicar claramente que es temporal o persistirse de forma segura y compartida');
test.todo('la herramienta debe incluir privacidad, derechos de uso y moderación antes de subir material de clientes o clonar voces');
test.todo('la tecla Enter debe guardar la primera API key aunque apiKey todavía esté vacío');
test.todo('debe eliminarse uploadToImgbb con la clave temporal ficticia y cualquier código de subida muerto');
test.todo('OpenGen debe exponer un postMessage versionado y con allowlist para entregar resultados al dashboard');
test.todo('la página debe aplicar CSP restrictiva, Referrer-Policy y límites Permissions-Policy');
