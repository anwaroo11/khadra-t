// Run: node tests/calculator-storage.cjs
// DOM/storage/clipboard simulation; no browser or third-party dependencies.
// Baseline is the approved main commit when this feature branch was created.
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
const current = fs.readFileSync(path.join(root, "index.html"), "utf8");
const baseline = execFileSync("git", ["show", "3385da7ee0ff92fc91fdf771369c028e895fa546:index.html"], {cwd:root,encoding:"utf8"});

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

const calculationSuite = String.raw`
const rows=[...api.SIMPLE_TEAS,...api.BRANDED_TEAS.flatMap(b=>b.items)];
const records=[];let transitions=0;
for(const item of api.getTeaCatalogItems()){
 api.selectTeaCard(item);flush();const raw=rows.find(t=>t.id===(item.typeId||item.id));
 for(const taste of ["normal","medium","nosugar"])for(const water of [1,50,100,250,500,780,1000,1500,2000,5000,780.5]){
 setTaste(taste);e("waterMl").value=water;api.render();
 const obj=api.getSelectedTeaObject(),text=api.getResultText(),html=e("output").innerHTML;
 const values=[...html.matchAll(/class="metric-value">([^<]*)/g)].map(m=>m[1]);
 if(values.length!==4||obj.teaPerLiterPicked!==raw.teaPerLiterByTaste[taste]||obj.sugarPerLiterPicked!==raw.sugarPerLiterByTaste[taste]||obj.teaType!==raw.teaType)throw Error("selection "+raw.id);
 const tokens=[values[0],values[1],values[2],values[3].replace(" بيالات","")];
 if(tokens.some(v=>!text.includes(v)))throw Error("share mismatch "+raw.id);
 records.push({id:raw.id,taste,water,values,base:obj.teaPerLiterPicked,sugar:obj.sugarPerLiterPicked,text});
 }}
for(const from of api.getTeaCatalogItems())for(const to of api.getTeaCatalogItems()){
 api.selectTeaCard(from);flush();const before=renders.length;
 api.selectTeaCard(to);
 if(SOURCE.includes("function getCalculation")){
 const interim=api.getCurrentCatalogItem();
 if(interim.value!==to.value||interim.typeId!==to.typeId)throw Error("non-atomic selection");
 if(renders.length-before!==1)throw Error("multiple selection renders");
 }
 flush();transitions++;
 const chosen=api.getCurrentCatalogItem();
 if(chosen.value!==to.value||chosen.typeId!==to.typeId)throw Error("wrong transition");
}
return {records,transitions};
`;

const regressionSuite = String.raw`
return (async()=>{
 let checks=0;const assert=(condition,message)=>{checks++;if(!condition)throw Error(message);};
 const reset=()=>{setMode("tea");api.setWaterPreset(1000);for(const id of ["waterMl","manualTeaPerLiter","manualSugarPerLiter"])e(id).bad=false;};
 const invalid=()=>{api.render();assert(!e("output").innerHTML.includes('class="metric-value"'),"invalid result visible");assert(!e("copyBtn")&&!e("waBtn"),"invalid actions visible");assert(api.getResultText()==="","invalid share text");};
 reset();const staleCopy=e("copyBtn").onclick,staleWa=e("waBtn").onclick;
 e("customWaterBtn").fire("click");
 assert(e("waterMl").value==="","custom water not empty");invalid();
 assert(!e("waterMl").classList.contains("hidden"),"custom input hidden");
 e("waterMl").fire("blur");assert(!e("waterMl").classList.contains("hidden"),"blur hides empty input");
 const priorCalls=copyCalls;await staleCopy();staleWa();assert(copyCalls===priorCalls&&window.location.href==="","stale actions used");
 e("waterMl").value="780.5";e("waterMl").fire("input");assert(api.getResultText().includes("9.4 جم"),"custom decimal");
 e("water500").fire("click");assert(e("waterMl").value==="500"&&api.getResultText().includes("6 جم"),"preset recovery");
 for(const value of ["","0","-1","0.5","100001","NaN","Infinity","1e309","1e","abc"]){reset();e("waterMl").value=value;invalid();}
 reset();e("waterMl").bad=true;invalid();reset();
 for(const value of ["1","780.5","100000"]){e("waterMl").value=value;assert(api.getResultText()!=="","valid water");}
 setMode("manual");e("waterMl").value="1000";e("manualTeaPerLiter").value="12";e("manualSugarPerLiter").value="0";api.render();
 assert(api.getResultText().includes("بدون سكر"),"explicit zero");
 for(const value of ["","-1","NaN","Infinity","1e309","1e","abc","2000.1"]){e("manualSugarPerLiter").value=value;invalid();}
 e("manualSugarPerLiter").value="";e("manualSugarPerLiter").bad=true;invalid();e("manualSugarPerLiter").bad=false;
 e("manualSugarPerLiter").value="50";
 for(const value of ["","0","-1","0.01","NaN","Infinity","1e308","1e","1000.1"]){e("manualTeaPerLiter").value=value;invalid();}
 for(const [tea,sugar,water]of [["0.1","0","1"],["1000","2000","100000"],["12.55","50.125","780.5"]]){e("manualTeaPerLiter").value=tea;e("manualSugarPerLiter").value=sugar;e("waterMl").value=water;api.render();assert(api.getResultText()!=="","valid decimal or boundary");}
 e("manualTeaPerLiter").value="12";e("manualSugarPerLiter").value="50";e("waterMl").value="1001";api.render();assert(api.getResultText().includes("50.1 جم"),"1001 rounding");
 assert(api.roundedProductText(50,503,1000)==="25.2","503 rounding");
 assert(api.roundedProductText(751,1,100)==="7.5","cup rounding");
 assert(api.roundedProductText(12.55,1000,1000)==="12.6","manual half");
 e("waterMl").value="1000";e("manualSteepMinutes").value="20-25 دقيقة";api.render();
 const expected=api.getResultText();
 await e("copyBtn").onclick();assert(copiedText===expected&&e("copyBtn").textContent==="تم النسخ ✓","clipboard success");flush();
 clipboardMode="fail";fallbackMode="success";api.render();await e("copyBtn").onclick();assert(e("copyBtn").textContent==="تم النسخ ✓","fallback success");flush();
 for(const mode of ["fail","throw"]){fallbackMode=mode;api.render();await e("copyBtn").onclick();assert(e("copyBtn").textContent!=="تم النسخ ✓"&&e("copyBtn").textContent.includes("تعذر"),"false copy success");assert(document.body.children.length===0,"textarea leaked");flush();}
 api.render();e("waBtn").onclick();
 assert(decodeURIComponent(window.location.href.split("?text=")[1])===api.getResultText(),"WhatsApp encoding");
 assert(api.getResultText().includes("https://khadra-t.netlify.app/"),"Netlify changed");
 reset();e("waterMl").value="";const product=api.getTeaCatalogItems().find(x=>x.typeId==="wazah-fbob1");api.selectTeaCard(product);
 assert(e("typeSelect").value==="wazah-fbob1","subtype not synchronized for invalid water");invalid();
 api.setWaterPreset(500);assert(api.getResultText().includes("(FBOB1)")&&api.getResultText().includes("6 جم"),"subtype recovery");
 return {regressionAssertions:checks,failures:0};
})();
`;

const exhaustiveSuite = String.raw`
let checks=0;const rows=[...api.SIMPLE_TEAS,...api.BRANDED_TEAS.flatMap(b=>b.items)];
for(const row of rows)for(const taste of ["normal","medium","nosugar"])for(let water=1;water<=5000;water++){
for(const field of ["teaPerLiterByTaste","sugarPerLiterByTaste"]){
 const base=row[field][taste],actual=Number(api.roundedProductText(base,water,1000));
 const expected=Math.floor((Math.round(base*10)*water+500)/1000)/10;
 if(actual!==expected)throw Error(JSON.stringify({id:row.id,taste,water,field,actual,expected}));checks++;
}
if(Number(api.roundedProductText(water,1,100))!==Math.floor((water+5)/10)/10)throw Error("cups");checks++;
}
return {combinations:435000,decimalChecks:checks,failures:0};
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

const storageSuite = String.raw`
let checks=0,roundTrips=0;const assert=(v,m)=>{checks++;if(!v)throw Error(m);};
const fresh=create(null),baseline=createBaseline(null);
assert(fresh.state().html===baseline.state().html,"fresh output changed");
assert(fresh.state().text===baseline.state().text,"fresh sharing changed");
assert(fresh.saved()===null&&fresh.writes()===0,"initialization saved defaults");
for(const item of fresh.api.getTeaCatalogItems())for(const taste of ["normal","medium","nosugar"]){
 const s=create(null);s.api.selectTeaCard(item);s.setTaste(taste);s.api.render();
 const r=create(s.saved());roundTrips++;
 assert(r.state().text===s.state().text,"product/taste roundtrip");
 assert(r.state().product===item.value,"product restore");
 if(item.typeId)assert(r.state().subtype===item.typeId,"subtype restore");
 assert(r.state().taste===taste,"taste restore");
 assert(r.results().every(result=>result===r.state().html),"transient wrong result");
 assert(r.writes()===0,"restore overwrites data");
}
for(const amount of [500,1000]){
 const s=create(null);s.api.setWaterPreset(amount);const r=create(s.saved());roundTrips++;
 assert(r.state().water===String(amount)&&!r.state().custom,"preset restoration");
 assert(r.e(amount===500?"water500":"water1000").classList.contains("active"),"preset active");
 assert(r.state().text===s.state().text,"preset calculation");
}
for(const amount of ["780.5","1001","500","1000"]){
 const s=create(null);s.e("customWaterBtn").fire("click");s.e("waterMl").value=amount;s.e("waterMl").fire("input");
 const r=create(s.saved());roundTrips++;
 assert(r.state().custom&&r.state().water===amount,"custom mode lost");
 assert(r.e("customWaterBtn").classList.contains("hidden"),"custom button state");
 assert(r.state().text===s.state().text,"custom result");
}
for(const sugar of ["0","50.125"]){
 const s=create(null);s.setMode("manual");s.e("manualTeaPerLiter").value="12.55";
 s.e("manualSugarPerLiter").value=sugar;s.e("manualSteepMinutes").value="20-25 دقيقة";s.api.render();
 const r=create(s.saved());roundTrips++;
 assert(r.state().mode==="manual"&&r.state().sugar===sugar,"manual restore");
 assert(r.state().text===s.state().text&&r.state().steep==="20-25 دقيقة","manual output");
 assert(r.results().every(result=>result===r.state().html),"manual transient result");
 const before=s.saved();
 for(const id of ["manualTeaPerLiter","manualSugarPerLiter","waterMl"]){
 const previous=s.e(id).value;
 for(const value of ["","-1","NaN","Infinity","1e","1e309"]){
 s.e(id).value=value;s.api.render();assert(s.saved()===before,"invalid saved "+id);
 assert(create(s.saved()).state().text===r.state().text,"invalid persisted result");
 }s.e(id).value=previous;
 s.e(id).bad=true;s.api.render();assert(s.saved()===before,"badInput saved");
 s.e(id).bad=false;
 }
}
const source={version:1,mode:"tea",product:"brand:munais",subtype:"munais-bop1",taste:"medium",waterMl:"780.5",waterMode:"custom",manual:null};
for(const corrupt of ["{","null","[]","123",JSON.stringify({version:2}),JSON.stringify({version:"1"})]){
 const r=create(corrupt);assert(r.state().html===baseline.state().html,"malformed fallback");
}
for(const bad of [undefined,null,{},[],true,"",-1,"NaN","Infinity","1e309","100001","0"]){
 const r=create(JSON.stringify({...source,waterMl:bad}));
 assert(r.state().water==="1000"&&!r.state().custom,"invalid water fallback");
 assert(r.state().subtype==="munais-bop1"&&r.state().taste==="medium","valid parts lost");
}
const unknown=create(JSON.stringify({...source,product:"simple:removed",subtype:"old"}));
assert(unknown.state().product===baseline.state().product,"removed product fallback");
assert(unknown.state().water==="780.5"&&unknown.state().taste==="medium","removed product valid parts");
const subtype=create(JSON.stringify({...source,subtype:"removed"}));
assert(subtype.state().subtype==="munais-op1","removed subtype fallback");
assert(subtype.results().every(r=>r===subtype.state().html),"removed subtype transient");
const mismatch=create(JSON.stringify({...source,subtype:"wazah-op1"}));
assert(mismatch.state().subtype==="munais-op1","foreign subtype");
const partial=create(JSON.stringify({version:1,waterMl:"500"}));
assert(partial.state().product===baseline.state().product&&partial.state().water==="500","partial fallback");
const invalidManual=create(JSON.stringify({...source,mode:"manual",manual:{teaPerLiter:"12",sugarPerLiter:"-1",steepMinutes:"20 دقيقة"}}));
assert(invalidManual.state().mode==="tea"&&invalidManual.state().sugar==="","invalid manual mode");
const dangerous=create(JSON.stringify({...source,mode:"manual",manual:{teaPerLiter:"12",sugarPerLiter:"0",steepMinutes:"<img src=x onerror=alert(1)>"}}));
assert(dangerous.state().mode==="manual"&&dangerous.state().steep==="","stored markup restored");
const encoded=create(JSON.stringify({...source,mode:"invalid",taste:"invalid"}));
assert(encoded.state().mode==="tea"&&encoded.state().taste==="normal","invalid enums");
for(const mode of ["read-denied","write-denied"]){
 const r=create(null,mode);r.api.setWaterPreset(500);
 assert(r.state().text.includes("6 جم")&&r.state().water==="500","blocked storage breaks calculation");
}
const valid=create(JSON.stringify(source));valid.e("customWaterBtn").fire("click");
assert(valid.saved()===JSON.stringify(source),"empty draft replaced saved state");
valid.e("waterMl").fire("blur");assert(valid.saved()===JSON.stringify(source),"blur replaced saved state");
const parsed=JSON.parse(createAndSave().saved());
assert(Object.keys(parsed).sort().join(",")==="manual,mode,product,subtype,taste,version,waterMl,waterMode","unexpected saved keys");
return {checks,roundTrips,failures:0};
`;

const featureSuite = String.raw`
let checks = 0;
const assert = (value, message) => { checks++; if (!value) throw Error(message); };
const FK = "khadra-t:favorites:v1", RK = "khadra-t:recent-brews:v1";
const packed = items => JSON.stringify({version:1,items});
const reload = s => create(s.saved(), "normal", s.dump());
const identity = item => ({product:item.value,subtype:item.typeId||null});
const fresh = create();
assert(fresh.api.collections().recent.length===0, "startup adds history");
assert(fresh.collectionWrites()===0, "startup writes collections");
const items = fresh.api.getTeaCatalogItems();
const simple = items.find(x=>x.type==="simple");
const branded = items.find(x=>x.typeId==="munais-bop1");
const otherType = items.find(x=>x.typeId==="munais-op1");
for (const item of [simple,branded]) {
 const s=create(); s.api.selectTeaCard(item); s.e("favoriteToggle").fire("click");
 assert(s.api.collections().favorites.length===1,"favorite add");
 assert(JSON.stringify(s.api.collections().favorites[0])===JSON.stringify(identity(item)),"favorite identity");
 const r=reload(s);
 assert(r.api.collections().favorites.length===1,"favorite reload");
 r.api.setWaterPreset(500);r.setTaste("medium");r.api.render();
 const before=r.state();
 r.e("favoriteList").children[0].children[0].fire("click");
 assert(r.state().product===item.value,"favorite select product");
 if(item.typeId)assert(r.state().subtype===item.typeId,"favorite select subtype");
 assert(r.state().taste===before.taste&&r.state().water===before.water,"favorite alters water/taste");
 assert(r.results().slice(-1)[0]===r.state().html,"favorite stale output");
 r.e("favoriteList").children[0].children[1].fire("click");
 assert(r.api.collections().favorites.length===0,"favorite remove button");
 assert(reload(r).api.collections().favorites.length===0,"favorite remove persistence");
}
{
 const s=create();s.api.selectTeaCard(branded);s.api.toggleCurrentFavorite();
 s.api.selectTeaCard(otherType);
 assert(s.e("favoriteToggle").attrs["aria-pressed"]==="false","favorite at brand level");
 s.api.toggleCurrentFavorite();assert(s.api.collections().favorites.length===2,"subtypes collapsed");
 s.api.toggleCurrentFavorite();assert(s.api.collections().favorites.length===1,"favorite toggle removal");
 s.setMode("manual");s.e("manualTeaPerLiter").value="12";s.e("manualSugarPerLiter").value="0";s.api.render();
 const count=s.results().length;s.api.selectFavoriteTea(identity(branded));
 assert(s.state().mode==="tea"&&s.state().subtype===branded.typeId,"favorite from manual");
 assert(s.results().slice(count).every(x=>x===s.state().html),"favorite transient result from manual");
}
for (const raw of ["{","null","[]","false",packed([null,{},identity(branded),{product:"brand:munais",subtype:"removed"},identity(branded)]),JSON.stringify({version:2,items:[identity(branded)]})]) {
 const s=create(null,"normal",{[FK]:raw});
 assert(s.api.getResultText()!=="","corrupt favorites breaks calculator");
 assert(s.api.collections().favorites.length===(raw.includes("removed")?1:0),"invalid favorites not filtered");
}
const teaEntry={mode:"tea",...identity(branded),taste:"medium",waterMl:"780.5",waterMode:"custom"};
const manualEntry={mode:"manual",teaPerLiter:"12.55",sugarPerLiter:"0",steepMinutes:"20-25 دقيقة",waterMl:"1001",waterMode:"custom"};
for(const entry of [teaEntry,manualEntry]){
 const s=create();s.api.restoreRecentBrew(entry);
 assert(s.api.collections().recent.length===1,"valid brew missing");
 const text=s.state().text;
 const r=reload(s);
 assert(r.api.collections().recent.length===1&&r.collectionWrites()===0,"reload adds brew");
 r.api.setWaterPreset(500);const count=r.results().length;
 r.e("recentBrewList").children[0].fire("click");
 assert(r.state().text===text,"history replay result");
 assert(r.results().slice(count).every(x=>x===r.state().html),"history transient result");
 assert(r.api.collections().recent.length===1,"replay latest duplicates");
 assert(r.state().custom,"custom mode lost");
 if(entry.mode==="manual") assert(r.state().sugar==="0"&&r.state().steep===entry.steepMinutes,"manual zero/duration lost");
 else assert(r.state().subtype===entry.subtype&&r.state().taste===entry.taste,"tea replay fields");
 const savedLast=JSON.parse(r.saved());assert(savedLast.waterMl===entry.waterMl&&savedLast.mode===entry.mode,"last-selection not updated");
 for(let i=0;i<5;i++)r.api.render();
 assert(r.api.collections().recent.length===1,"render adds history");
}
{
 const s=create();s.e("water500").fire("click");
 assert(s.api.collections().recent.length===0,"preset draft recorded");
 s.e("calculateBtn").fire("click");
 assert(s.api.collections().recent.length===1,"preset not recorded");
 s.e("water500").fire("click");assert(s.api.collections().recent.length===1,"duplicate preset");
 s.e("customWaterBtn").fire("click");assert(s.api.collections().recent.length===1,"empty custom recorded");
 s.e("waterMl").value="780.5";s.e("waterMl").fire("input");
 assert(s.api.collections().recent.length===1,"keystroke recorded");
 s.e("waterMl").fire("change");assert(s.api.collections().recent.length===1,"custom change recorded");
 s.e("calculateBtn").fire("click");assert(s.api.collections().recent.length===2,"calculate did not commit");
 s.e("taste").value="medium";s.e("taste").fire("change");assert(s.api.collections().recent.length===2,"taste draft recorded");
 s.e("calculateBtn").fire("click");assert(s.api.collections().recent.length===3,"taste commit missing");
 for(let i=1;i<=11;i++){s.e("waterMl").value=String(1000+i);s.e("waterMl").fire("input");s.e("waterMl").fire("change");s.e("calculateBtn").fire("click");}
 assert(s.api.collections().recent.length===10,"history cap");
 assert(s.api.collections().recent[0].waterMl==="1011"&&s.api.collections().recent[9].waterMl==="1002","wrong eviction order");
 const older=s.api.collections().recent[5];s.api.restoreRecentBrew(older);
 assert(s.api.collections().recent.length===10&&s.api.collections().recent[0].waterMl===older.waterMl,"older replay not recorded");
 const before=s.dump()[RK];s.api.restoreRecentBrew(older);assert(s.dump()[RK]===before,"consecutive replay duplicate");
 s.e("clearRecentBrews").fire("click");
 assert(s.api.collections().recent.length===0&&reload(s).api.collections().recent.length===0,"clear persistence");
 s.api.render();assert(s.api.collections().recent.length===0,"render refills cleared history");
}
for(const field of ["waterMl","manualTeaPerLiter","manualSugarPerLiter"]){
 for(const raw of ["","-1","NaN","Infinity","1e309","1e","abc",field==="waterMl"?"100001":field==="manualTeaPerLiter"?"1001":"2001"]){
 const s=create();s.api.restoreRecentBrew(manualEntry);const before=s.dump()[RK];
 s.e(field).value=raw;s.e(field).fire("input");s.e(field).fire("change");
 assert(s.dump()[RK]===before,"invalid input recorded "+field+" "+raw);
 assert(reload(s).state().text!==""&&reload(s).api.collections().recent.length===1,"invalid reload");
 }
 const s=create();s.api.restoreRecentBrew(manualEntry);const before=s.dump()[RK];s.e(field).bad=true;s.e(field).fire("change");
 assert(s.dump()[RK]===before,"badInput recorded");
}
const invalidEntries=[null,{},[],{...teaEntry,product:"removed"},{...teaEntry,subtype:"removed"},{...teaEntry,subtype:"wazah-op1"},{...teaEntry,taste:"removed"},{...teaEntry,waterMl:""},{...manualEntry,sugarPerLiter:"-1"},{...manualEntry,teaPerLiter:null},{...manualEntry,steepMinutes:"<img src=x onerror=alert(1)>"}];
for(const entry of invalidEntries){
 const s=create(null,"normal",{[RK]:packed([entry,teaEntry])});
 assert(s.api.collections().recent.length===1,"invalid stored brew accepted");
 const before=s.state().text;s.api.restoreRecentBrew(entry);
 assert(s.state().text===before,"invalid replay changed calculator");
}
for(const raw of ["{","null","[]",JSON.stringify({version:2,items:[teaEntry]}),JSON.stringify({version:1,items:{}})]){
 const s=create(null,"normal",{[RK]:raw});assert(s.api.collections().recent.length===0&&s.state().text!=="","bad history disables calculator");
}
for(const mode of ["read-denied","write-denied"]){
 const s=create(null,mode,{});s.api.selectTeaCard(branded);s.api.toggleCurrentFavorite();s.e("water500").fire("click");
 assert(s.state().text!==""&&s.api.collections().favorites.length===1,"storage failure breaks functionality");
 if(mode==="write-denied")assert(s.e("brewStorageNotice").textContent.includes("تعذر"),"silent save failure");
}
{
 const s=create();s.api.selectTeaCard(branded);s.api.toggleCurrentFavorite();s.e("calculateBtn").fire("click");s.api.restoreRecentBrew(manualEntry);
 const data=s.dump(),fav=JSON.parse(data[FK]),history=JSON.parse(data[RK]);
 assert(fav.version===1&&history.version===1,"missing version");
 assert(Object.keys(fav.items[0]).sort().join(",")==="product,subtype","favorite contains extra inputs");
 for(const entry of history.items)assert(!["teaGrams","sugarText","cups","text","result"].some(k=>k in entry),"calculated result saved");
 const restored=reload(s);assert(restored.api.collections().favorites.length===1&&restored.api.collections().recent.length===2,"independent stores");
 assert(restored.state().mode==="manual"&&restored.state().sugar==="0","last-selection coexistence");
}
return {featureAssertions:checks,failures:0};
`;

const presentationSuite = String.raw`
let checks = 0;
const assert = (value, message) => { checks++; if (!value) throw Error(message); };
const s=create();
assert(s.e("tasteTabs").children.length===3,"taste UI does not match source options");
for(const button of s.e("tasteTabs").children){
 button.fire("click");
 assert(s.state().taste===button.value,"taste button bypasses existing select");
 assert(button.attrs["aria-pressed"]==="true","taste state missing");
}
const oldHistory=s.dump()["khadra-t:recent-brews:v1"];
s.e("calculateBtn").fire("click");
assert(oldHistory===undefined,"taste previews create history");
assert(s.api.collections().recent.length===1,"calculate fails to commit");
const before=s.state().text;
for(const id of ["navFavorites","navRecent","navCalculator"]){
 s.e(id).fire("click");
 assert(s.e(id).attrs["aria-current"]==="page","navigation active state");
 assert(s.state().text===before,"navigation changes calculation");
}
const item=s.api.getTeaCatalogItems().find(i=>i.typeId==="munais-bop1");
s.api.selectTeaCard(item);s.api.toggleCurrentFavorite();
const card=s.e("favoriteList").children[0].children[0];
assert(card.children[0].children[0].children[0].src===item.image,"favorite uses wrong image");
assert(card.children[0].children[1].children[1].textContent===item.teaType,"favorite subtype label");
s.e("navFavorites").fire("click");card.fire("click");
assert(s.e("navCalculator").attrs["aria-current"]==="page","favorite stays in secondary view");
s.e("navRecent").fire("click");s.e("recentBrewList").children[0].fire("click");
assert(s.e("navCalculator").attrs["aria-current"]==="page","recent stays in secondary view");
s.e("customWaterBtn").fire("click");
s.e("calculateBtn").fire("click");
assert(s.state().text==="","calculate shows stale invalid output");
assert(!s.e("copyBtn")&&!s.e("waBtn"),"invalid actions reintroduced");
return {presentationAssertions:checks,failures:0};
`;


const finalActionSuite = String.raw`
let checks=0;
const assert=(v,m)=>{checks++;if(!v)throw Error(m);};
const s=create();
s.e("customWaterBtn").fire("click");
for(const value of ["1","10","100","1000","1001","1002","1003"]){
 s.e("waterMl").value=value;
 for(const event of ["input","change","blur"])s.e("waterMl").fire(event);
 s.api.render();
 assert(s.api.collections().recent.length===0,"typing/spinner/blur commits "+value);
}
s.e("calculateBtn").fire("click");
assert(s.api.collections().recent.length===1&&s.api.collections().recent[0].waterMl==="1003","final water not committed");
s.e("calculateBtn").fire("click");
assert(s.api.collections().recent.length===1,"duplicate calculate");
const r=create(s.saved(),"normal",s.dump());
assert(r.api.collections().recent.length===1&&r.collectionWrites()===0,"reload commits");
for(const value of ["","-1","Infinity","1e","100001"]){
 r.e("waterMl").value=value;r.e("waterMl").fire("input");r.e("calculateBtn").fire("click");
 assert(r.api.collections().recent.length===1,"invalid calculate commits");
}
r.e("water1000").fire("click");
r.e("modeManualBtn").fire("click");
r.e("manualTeaPerLiter").value="12.55";
r.e("manualSugarPerLiter").value="0";
for(const id of ["manualTeaPerLiter","manualSugarPerLiter"])for(const event of ["input","change","blur"])r.e(id).fire(event);
assert(r.api.collections().recent.length===1,"manual drafts commit");
r.e("calculateBtn").fire("click");
assert(r.api.collections().recent[0].mode==="manual"&&r.api.collections().recent[0].sugarPerLiter==="0","manual zero final action");
const tea=r.api.getTeaCatalogItems().find(i=>i.typeId==="munais-bop1");
r.api.selectTeaCard(tea);
assert(r.api.collections().recent.length===2,"catalog selection commits");
r.api.selectFavoriteTea({product:tea.value,subtype:tea.typeId});
assert(r.state().subtype===tea.typeId&&r.api.collections().recent.length===3,"favorite final action");
return {finalActionAssertions:checks,failures:0};
`;

const source = html => html.match(/<script>([\s\S]*?)<\/script>/)[1];
const run = (html, suite) => Function("HTML","SOURCE","INITIAL","STORAGE_MODE","COLLECTIONS",harness+suite)(html,source(html),null,"normal",{});
const make = html => (raw=null,mode="normal",collections={}) =>
  Function("HTML","SOURCE","INITIAL","STORAGE_MODE","COLLECTIONS",harness+sessionReturn)(html,source(html),raw,mode,collections);
(async()=>{
  const getFunctions = html => Object.fromEntries([...source(html).matchAll(/^function (\w+)\([^]*?^\}/gm)].map(m=>[m[1],m[0]]));
  const beforeFunctions=getFunctions(baseline), afterFunctions=getFunctions(current);
  const presentationChanges=new Set(["initializeBrewCollections","selectTeaCard","initializeDashboard","appendTeaPresentation"]);
  let protectedFunctions=0;
  for(const [name,code] of Object.entries(beforeFunctions)){
    if(!presentationChanges.has(name)){
      if(afterFunctions[name]!==code)throw Error("Protected function changed: "+name);
      protectedFunctions++;
    }
  }
  if(source(baseline).split("const imageCache")[0]!==source(current).split("const imageCache")[0])throw Error("Tea data changed");
  if(baseline.split("<style>")[0]!==current.split("<style>")[0])throw Error("Head/PWA changed");
  console.log({protectedFunctions,teaDataIdentical:true,headAndPwaIdentical:true});
  const before=run(baseline,calculationSuite),after=run(current,calculationSuite);
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error("baseline mismatch");
  console.log({calculationCases:after.records.length,transitions:after.transitions,baselineEqual:true});
  console.log(await run(current,regressionSuite));
  console.log(run(current,exhaustiveSuite));
  const create=make(current),createBaseline=make(baseline);
  console.log(Function("create","createBaseline","createAndSave",storageSuite)(
    create,createBaseline,()=>{const s=create();s.api.setWaterPreset(500);return s;}
  ));
  console.log(Function("create",featureSuite)(create));
  console.log(Function("create",presentationSuite)(create));
  console.log(Function("create",finalActionSuite)(create));
})().catch(error=>{console.error(error);process.exitCode=1;});
