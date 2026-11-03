// يشغّل النسخة المعتمدة السابقة من index.html داخل محاكاة DOM بسيطة
// حتى نقارن نتائجها مع النسخة الجديدة. بدون أي مكتبات خارجية.
const {execFileSync} = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
// آخر نسخة معتمدة قبل إعادة التصميم.
const LEGACY_COMMIT = "af987ac";
const harness = String.raw`
const els=new Map(),timers=[],renders=[];
let clipboardMode="success",fallbackMode="success",copiedText="",copyCalls=0;
class El {
 constructor(tag="div"){this.tag=tag;this.children=[];this._value="";this._html="";this._text="";this.style={};this.listeners={};this.min="";this.max="";this.required=false;this.bad=false;this.isConnected=true;const cs=new Set();this.classList={add:(...a)=>a.forEach(v=>cs.add(v)),remove:(...a)=>a.forEach(v=>cs.delete(v)),toggle:(v,b)=>{if(b===undefined)b=!cs.has(v);b?cs.add(v):cs.delete(v)},contains:v=>cs.has(v)};}
 get validity(){return {badInput:this.bad,valid:!this.bad&&(!this.required||this.value!=="")&&(this.value===""||(Number.isFinite(Number(this.value))&&(this.min===""||Number(this.value)>=Number(this.min))&&(this.max===""||Number(this.value)<=Number(this.max))))};}
 get value(){return this._value;}
 set value(v){this._value=this.tag==="select"&&!this.options.some(o=>o.value===String(v))?"":String(v);}
 get options(){return this.children;}
 get innerHTML(){return this._html;}
 set innerHTML(v){this._html=v;this.children=[];if(this.tag==="select")this._value="";if(this.id==="output"){renders.push(v);for(const id of ["copyBtn","waBtn"]){if(els.has(id))els.get(id).isConnected=false;els.delete(id);}for(const id of ["copyBtn","waBtn"])if(v.includes('id="'+id+'"')){const el=new El("button");el.id=id;els.set(id,el);}}}
 get textContent(){return this._text;}
 set textContent(v){this._text=v;this.innerHTML=v;}
 appendChild(e){this.children.push(e);e.parent=this;if(this.tag==="select"&&this.children.length===1)this._value=e.value;return e;}
 removeChild(e){this.children=this.children.filter(x=>x!==e);e.isConnected=false;}
 remove(){if(this.parent)this.parent.removeChild(this);}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
 fire(k){for(const f of this.listeners[k]||[])f({target:this});}
 dispatchEvent(event){this.fire(event.type);return true;}
 cloneNode(){const el=new El(this.tag);el.min=this.min;el.max=this.max;el.required=this.required;return el;}
 setAttribute(k,v){(this.attrs??={})[k]=String(v);}
 focus(){document.activeElement=this;} select(){} setSelectionRange(){} scrollIntoView(){}
}
const document={getElementById:id=>els.get(id)||null,createElement:t=>new El(t),querySelector:()=>null,body:new El(),activeElement:null,execCommand:()=>{if(fallbackMode==="throw")throw Error("denied");return fallbackMode==="success";}};
for(const m of HTML.matchAll(/<(input|select|div|button|p|section|summary|details)[^>]*\bid="([^"]+)"[^>]*>/g)){const el=new El(m[1]);el.id=m[2];for(const attr of ["min","max"])el[attr]=m[0].match(new RegExp(attr+'="([^"]*)"'))?.[1]||"";el.required=/\brequired\b/.test(m[0]);for(const cls of (m[0].match(/class="([^"]*)"/)?.[1]||"").split(/\s+/).filter(Boolean))el.classList.add(cls);els.set(m[2],el);}
for(const match of HTML.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){
 const el=els.get(match[1]);for(const item of match[2].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)/g)){
 const opt=new El("option");opt.value=item[1];opt.textContent=item[2];el.appendChild(opt);
 if(item[0].includes("selected"))el.value=item[1];
 }
}
const window={location:{href:""}},navigator={clipboard:{writeText:async text=>{copyCalls++;if(clipboardMode==="fail")throw Error("denied");copiedText=text;}}};
let stored = INITIAL, writes=0;
const collectionStore={...COLLECTIONS};let collectionWrites=0;
const localStorage={
getItem:key=>{if(STORAGE_MODE==="read-denied")throw Error("SecurityError");return key==="khadra-t:last-selection:v1"?stored:collectionStore[key]??null;},
setItem:(key,value)=>{if(STORAGE_MODE==="write-denied")throw Error("QuotaExceededError");if(key==="khadra-t:last-selection:v1"){writes++;stored=value;}else{collectionWrites++;collectionStore[key]=value;}}
};
const api=Function("document","window","navigator","Image","setTimeout","localStorage","Event",SOURCE+";return {SIMPLE_TEAS,BRANDED_TEAS,getTeaCatalogItems,getCurrentCatalogItem,selectTeaCard,getSelectedTeaObject,getManualTeaObject,getResultText,render,renderTeaCatalog,setWaterPreset,updateModeUI,smartNumber,bindActionButtons"+(SOURCE.includes("function getCalculation")?",getCalculation,roundedProductText,readNumericInput,copyResultText":"")+(SOURCE.includes("function initializeBrewCollections")?",toggleCurrentFavorite,selectFavoriteTea,recordRecentBrew,restoreRecentBrew,normalizeRecentBrew,collections:()=>({favorites:favoriteTeas,recent:recentBrews})":"")+"};")(document,window,navigator,class{},f=>timers.push(f),localStorage,Event);
const flush=()=>{while(timers.length)timers.shift()();};
const e=id=>els.get(id);
function setMode(mode){const el=e("modeSelect");if(!el.options.some(o=>o.value===mode)){const o=new El("option");o.value=mode;el.appendChild(o);}el.value=mode;api.updateModeUI();}
function setTaste(t){const el=e("taste");if(!el.options.some(o=>o.value===t)){const o=new El("option");o.value=t;el.appendChild(o);}el.value=t;}
`;
const sessionReturn = String.raw`
return {
 dump:()=>({...collectionStore}),collectionWrites:()=>collectionWrites,api,e,setMode,setTaste,flush,
 saved:()=>stored,writes:()=>writes,
 state:()=>({mode:e("modeSelect").value,product:e("teaSelect").value,subtype:e("typeSelect").value,
 taste:e("taste").value,water:e("waterMl").value,custom:!e("waterMl").classList.contains("hidden"),
 tea:e("manualTeaPerLiter").value,sugar:e("manualSugarPerLiter").value,steep:e("manualSteepMinutes").value,
 text:api.getResultText(),html:e("output").innerHTML}),
 results:()=>renders.filter(r=>r.includes('class="metric-value"'))
};
`;
const legacyHtml = execFileSync("git", ["show", LEGACY_COMMIT + ":index.html"], {cwd: root, encoding: "utf8"});
const legacySource = legacyHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
function createLegacy(raw = null, mode = "normal", collections = {}) {
  return Function("HTML","SOURCE","INITIAL","STORAGE_MODE","COLLECTIONS", harness + sessionReturn)(
    legacyHtml, legacySource, raw, mode, collections);
}
module.exports = {createLegacy, LEGACY_COMMIT};
