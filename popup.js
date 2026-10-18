const SUPABASE_URL = "https://iirxewgecavovbasafud.supabase.co";
const SUPABASE_KEY = "sb_publishable_5Rp10ZaSKUEqlLwjYarvpQ_aVs0yh_p";
const BACKEND_URL = "https://trustai-backend-93qs.onrender.com";
const SITE_URL = "https://rat-os-dev.github.io/TrustAI/";
const AUTH_KEY = "trustAIAuthSession";

const CATALOG = [
 {id:"grok-4.7",name:"Grok 4.7",family:"xAI",description:"Flagship Grok model",tier:"average",input:2,output:6},
 {id:"grok-4.6",name:"Grok 4.6",family:"xAI",description:"Previous flagship Grok",tier:"average",input:2,output:6},
 {id:"grok-4.5",name:"Grok 4.5",family:"xAI",description:"Strong general Grok",tier:"average",input:2,output:6},
 {id:"grok-4.3",name:"Grok 4.3",family:"xAI",description:"Long-context Grok",tier:"average",input:1.25,output:2.5},
 {id:"grok-4-1-fast-reasoning",name:"Grok 4 Fast",family:"xAI",description:"Fast, lower-cost Grok",tier:"average",input:1.25,output:2.5},
 {id:"gpt-5",name:"GPT-5",family:"OpenAI",description:"Flagship GPT-5",tier:"average",input:1.25,output:10},
 {id:"gpt-5-mini",name:"GPT-5 mini",family:"OpenAI",description:"Faster, cheaper GPT-5",tier:"average",input:.25,output:2},
 {id:"gpt-5-nano",name:"GPT-5 nano",family:"OpenAI",description:"Smallest GPT-5 tier",tier:"cheap",input:.05,output:.4},
 {id:"gpt-4.1",name:"GPT-4.1",family:"OpenAI",description:"Strong GPT-4.1 model",tier:"average",input:2,output:8},
 {id:"gpt-4o-mini",name:"GPT-4o mini",family:"OpenAI",description:"Fast, affordable GPT-4o",tier:"cheap",input:.15,output:.6},
 {id:"claude-opus-5-5",name:"Claude Opus 5.5",family:"Anthropic",description:"Flagship Claude model",tier:"average",input:4,output:20},
 {id:"claude-opus-5",name:"Claude Opus 5",family:"Anthropic",description:"Advanced reasoning model",tier:"average",input:5,output:25},
 {id:"claude-sonnet-5-5",name:"Claude Sonnet 5.5",family:"Anthropic",description:"Balanced high-performance model",tier:"average",input:2,output:10},
 {id:"claude-sonnet-5",name:"Claude Sonnet 5",family:"Anthropic",description:"Previous Sonnet generation",tier:"average",input:2,output:10},
 {id:"claude-haiku-5-5",name:"Claude Haiku 5.5",family:"Anthropic",description:"Fast, lower-cost Claude model",tier:"cheap",input:.1,output:.5},
];
const MIN_MODELS=2, MAX_MODELS=10, MIN_WEIGHT=5;
const $ = id => document.getElementById(id);
let selected = new Set(["grok-4.7","gpt-5"]);
let weights = {"grok-4.7":50,"gpt-5":50};
let lastResult = null;
let account = null;
let signupMode = false;

function setMessage(id,text,error=false){$(id).textContent=text;$(id).classList.toggle("error",error);}
function formatMoney(value){const n=Number(value);return Number.isFinite(n)?"$"+n.toFixed(8).replace(/0+$/,"").replace(/\.$/,".00"):"—";}
function estimateCost(chars,ids){
 const count=Math.max(1,Number(chars)||1), answerTokens=Math.ceil(count/4);
 const inTokens=Math.ceil(answerTokens*2.5+900),outTokens=Math.ceil(answerTokens*.75+500);
 let raw=0;ids.forEach(id=>{const m=CATALOG.find(x=>x.id===id);if(m)raw+=((inTokens*m.input+outTokens*m.output)/1e6)*1.5;});
 return Math.round(raw*(raw<1?1.2:1.1)*1e8)/1e8;
}
function updateCost(){const cost=estimateCost($("answerText").value.length,[...selected]);$("costPreview").textContent=formatMoney(cost);$("modelCount").textContent=selected.size+" model"+(selected.size===1?"":"s");}
function validWeights(){const ids=[...selected];return ids.length>=MIN_MODELS&&ids.length<=MAX_MODELS&&ids.every(id=>Number(weights[id])>=MIN_WEIGHT)&&ids.reduce((sum,id)=>sum+(Number(weights[id])||0),0)===100;}
function equalize(){const ids=[...selected];if(!ids.length){weights={};return;}const base=Math.floor(100/ids.length),rem=100%ids.length;weights={};ids.forEach((id,i)=>weights[id]=base+(i<rem?1:0));}
function updateTotal(){const total=[...selected].reduce((s,id)=>s+(Number(weights[id])||0),0);$("weightTotal").textContent="Total: "+total+"%";$("weightTotal").classList.toggle("valid",validWeights());$("weightTotal").classList.toggle("invalid",!validWeights());$("saveModels").disabled=!validWeights();$("checkAnswer").disabled=!validWeights();setMessage("modelMessage",selected.size<MIN_MODELS?"Select at least 2 models.":selected.size>MAX_MODELS?"Select no more than 10 models.":validWeights()?"Weights total 100%. Ready to check.":"Adjust weights to total exactly 100%.",!validWeights());}
function renderModels(){
 const q=$("modelSearch").value.trim().toLowerCase();$("modelList").innerHTML="";
 CATALOG.filter(m=>(m.name+" "+m.family+" "+m.description).toLowerCase().includes(q)).forEach(m=>{
  const label=document.createElement("label");label.className="model";const cb=document.createElement("input");cb.type="checkbox";cb.checked=selected.has(m.id);cb.setAttribute("aria-label","Select "+m.name);
  const main=document.createElement("span");main.className="model-main";const name=document.createElement("span");name.className="model-name";name.textContent=m.name+" · "+m.family;const desc=document.createElement("div");desc.className="model-desc";desc.textContent=m.description;main.append(name,desc);
  const tier=document.createElement("span");tier.className="tier"+(m.tier==="cheap"?" cheap":"");tier.textContent=m.tier==="cheap"?"LOWER COST":"STANDARD";
  label.append(cb,main,tier);cb.addEventListener("change",()=>{if(cb.checked){if(selected.size>=MAX_MODELS){cb.checked=false;setMessage("modelMessage","You can select up to 10 models.",true);return;}selected.add(m.id);weights[m.id]=0;}else{if(selected.size<=MIN_MODELS){cb.checked=true;setMessage("modelMessage","Keep at least 2 models selected.",true);return;}selected.delete(m.id);delete weights[m.id];}equalize();renderModels();renderWeights();updateTotal();updateCost();});$("modelList").append(label);
 });
 $("selectionCount").textContent=selected.size+" selected";
}
function renderWeights(){
 $("weightsList").innerHTML="";
 [...selected].forEach(id=>{const m=CATALOG.find(x=>x.id===id);if(!m)return;const row=document.createElement("div");row.className="weight-row";const top=document.createElement("div");top.className="weight-top";const name=document.createElement("span");name.textContent=m.name;const value=document.createElement("strong");value.textContent=(weights[id]||0)+"%";top.append(name,value);const slider=document.createElement("input");slider.type="range";slider.min=String(MIN_WEIGHT);slider.max=String(100-(selected.size-1)*MIN_WEIGHT);slider.step="1";slider.value=String(Math.max(MIN_WEIGHT,Number(weights[id])||MIN_WEIGHT));slider.setAttribute("aria-label",m.name+" weight");slider.addEventListener("input",()=>{weights[id]=Number(slider.value);value.textContent=weights[id]+"%";updateTotal();});row.append(top,slider);$("weightsList").append(row);});
 updateTotal();
}
function showView(id){document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===id));if(id==="accountView")loadAccount().catch(()=>{});}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
$("changeModels").addEventListener("click",()=>showView("modelsView"));
$("modelSearch").addEventListener("input",renderModels);
$("answerText").addEventListener("input",updateCost);
$("equalWeights").addEventListener("click",()=>{equalize();renderWeights();updateTotal();});
$("saveModels").addEventListener("click",async()=>{if(!validWeights()){setMessage("modelMessage","Choose 2–10 models and make weights total exactly 100%.",true);return;}await chrome.storage.local.set({trustAISelectedModels:[...selected],trustAIModelWeights:weights});showView("checkView");setMessage("checkMessage","Models selected. Your next check will use these models.");updateCost();});
$("clearAnswer").addEventListener("click",()=>{$("answerText").value="";$("resultArea").classList.add("hidden");setMessage("checkMessage","");updateCost();});
$("loadSelection").addEventListener("click",async()=>{setMessage("checkMessage","Looking for highlighted text…");try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const r=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>window.getSelection?window.getSelection().toString().trim():""});const text=r?.[0]?.result||"";if(!text){setMessage("checkMessage","No highlighted text found. Select text on the page first, or paste it above.",true);return;}$("answerText").value=text.slice(0,12000);updateCost();setMessage("checkMessage",text.length>12000?"Loaded the first 12,000 characters.":"Text loaded. Review it before checking.");}catch(e){setMessage("checkMessage","This page does not allow selection access. Paste the answer above.",true);}});
async function getSession(){const data=await chrome.storage.local.get(AUTH_KEY);let s=data[AUTH_KEY];if(!s?.access_token)return null;if(s.expires_at&&s.expires_at*1000<Date.now()+60000){if(!s.refresh_token)return null;const r=await fetch(SUPABASE_URL+"/auth/v1/token?grant_type=refresh_token",{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},body:JSON.stringify({refresh_token:s.refresh_token})});const next=await r.json().catch(()=>({}));if(!r.ok||!next.access_token){await chrome.storage.local.remove(AUTH_KEY);return null;}s={...next,expires_at:next.expires_at||Math.floor(Date.now()/1000)+(next.expires_in||3600)};await chrome.storage.local.set({[AUTH_KEY]:s});}return s;}
async function authRequest(path,body){const r=await fetch(SUPABASE_URL+path,{method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.msg||data.message||data.error_description||data.error||"Authentication failed.");return data;}
async function saveSession(s){if(!s?.access_token)throw new Error("Sign-in did not return an active session. Check your email if confirmation is required.");s.expires_at=s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600);await chrome.storage.local.set({[AUTH_KEY]:s});$("statusBadge").textContent="SIGNED IN";await loadAccount();}
$("loginButton").addEventListener("click",async()=>{const email=$("email").value.trim().toLowerCase(),password=$("password").value;if(!email||!password){setMessage("authMessage","Enter your email and password.",true);return;}const b=$("loginButton");b.disabled=true;b.textContent="Logging in…";try{const s=await authRequest("/auth/v1/token?grant_type=password",{email,password});if(s.user?.id&&s.user.user_metadata?.full_name&&s.user.user_metadata?.date_of_birth){await fetch(SUPABASE_URL+"/rest/v1/profiles?id=eq."+encodeURIComponent(s.user.id),{method:"PATCH",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":"Bearer "+s.access_token,"Prefer":"return=minimal"},body:JSON.stringify({full_name:s.user.user_metadata.full_name,date_of_birth:s.user.user_metadata.date_of_birth})});}await saveSession(s);setMessage("authMessage","Signed in successfully.");}catch(e){setMessage("authMessage",e.message,true);}finally{b.disabled=false;b.textContent="Log in";}});
$("showSignup").addEventListener("click",()=>{signupMode=true;$("loginFields").classList.add("hidden");$("signupFields").classList.remove("hidden");$("authTitle").textContent="Create an account";setMessage("authMessage","");});
$("showLogin").addEventListener("click",()=>{signupMode=false;$("signupFields").classList.add("hidden");$("loginFields").classList.remove("hidden");$("authTitle").textContent="Log in to Trust AI";setMessage("authMessage","");});
$("signupButton").addEventListener("click",async()=>{const full_name=$("fullName").value.trim(),date_of_birth=$("dob").value,email=$("signupEmail").value.trim().toLowerCase(),password=$("signupPassword").value;if(!full_name||full_name.length>120||!date_of_birth||!email||password.length<8){setMessage("authMessage","Enter your name, date of birth, email, and a password of at least 8 characters.",true);return;}if(new Date(date_of_birth+"T00:00:00Z")>new Date()){setMessage("authMessage","Date of birth cannot be in the future.",true);return;}const b=$("signupButton");b.disabled=true;b.textContent="Creating…";try{const s=await authRequest("/auth/v1/signup",{email,password,data:{full_name,date_of_birth}});if(s.access_token){await saveSession(s);const user=s.user;if(user?.id){await fetch(SUPABASE_URL+"/rest/v1/profiles?id=eq."+encodeURIComponent(user.id),{method:"PATCH",headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":"Bearer "+s.access_token,"Prefer":"return=minimal"},body:JSON.stringify({full_name,date_of_birth})});}setMessage("authMessage","Account created and signed in.");}else{setMessage("authMessage","Account created. Confirm your email, then return here and log in.");$("email").value=email;$("showLogin").click();}}catch(e){setMessage("authMessage",e.message,true);}finally{b.disabled=false;b.textContent="Create account";}});
async function loadAccount(){const s=await getSession();if(!s?.access_token){account=null;$("signedOutPanel").classList.remove("hidden");$("accountPanel").classList.add("hidden");$("statusBadge").textContent="READY";return;}try{const r=await fetch(BACKEND_URL+"/api/account",{headers:{"Authorization":"Bearer "+s.access_token,"Accept":"application/json"}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Could not load account ("+r.status+").");account=d;$("signedOutPanel").classList.add("hidden");$("accountPanel").classList.remove("hidden");$("statusBadge").textContent="SIGNED IN";$("accountName").textContent=d.full_name||"Your account";$("accountEmail").textContent=d.email||s.user?.email||"—";$("accountFullName").textContent=d.full_name||"Not provided";$("accountDob").textContent=d.date_of_birth||"Not provided";$("balanceValue").textContent=Number(d.balance_usd).toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:8});setMessage("accountMessage","Account balance is current.");}catch(e){setMessage("accountMessage",e.message,true);throw e;}}
$("refreshAccount").addEventListener("click",()=>loadAccount().catch(()=>{}));
$("logoutButton").addEventListener("click",async()=>{const s=await getSession();try{if(s?.access_token)await fetch(SUPABASE_URL+"/auth/v1/logout",{method:"POST",headers:{"apikey":SUPABASE_KEY,"Authorization":"Bearer "+s.access_token}});}catch(e){}await chrome.storage.local.remove(AUTH_KEY);account=null;$("accountPanel").classList.add("hidden");$("signedOutPanel").classList.remove("hidden");$("statusBadge").textContent="READY";setMessage("authMessage","Logged out.");});
$("addFunds").addEventListener("click",()=>chrome.tabs.create({url:SITE_URL+"funds.html"}));
$("checkAnswer").addEventListener("click",async()=>{const answer=$("answerText").value.trim(),ids=[...selected];if(!answer){setMessage("checkMessage","Paste or load an answer first.",true);return;}if(answer.length>12000){setMessage("checkMessage","Text must be 12,000 characters or fewer.",true);return;}if(!validWeights()){setMessage("checkMessage","Choose 2–10 models and make weights total exactly 100%. Open Models to adjust.",true);return;}let s;try{s=await getSession();}catch(e){setMessage("checkMessage","Could not refresh your login. Please log in again.",true);showView("accountView");return;}if(!s?.access_token){setMessage("checkMessage","Log in to run a check. Open Account to sign in.",true);showView("accountView");return;}const b=$("checkAnswer");b.disabled=true;b.textContent="Checking with "+ids.length+" models…";setMessage("checkMessage","Evaluating answer. Please keep this popup open.");$("resultArea").classList.add("hidden");try{const weightsPayload={};ids.forEach(id=>weightsPayload[id]=Number(weights[id]));const r=await fetch(BACKEND_URL+"/api/evaluate",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+s.access_token},body:JSON.stringify({answer,models:ids,weights:weightsPayload})});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||data.message||"Evaluation failed ("+r.status+").");if(typeof data.trustScore!=="number"||!data.providers)throw new Error("The server returned an invalid evaluation result.");lastResult={...data,answer,models:ids,weights:weightsPayload,checkedAt:new Date().toISOString()};await chrome.storage.local.set({trustAILastResult:lastResult});await loadAccount().catch(()=>{});$("trustScore").textContent=String(Math.round(data.trustScore));$("scoreSummary").textContent="Combined score from "+ids.length+" selected models and your weights";$("actualCost").textContent=typeof data.billing?.cost_usd==="number"?formatMoney(data.billing.cost_usd):"Not returned";$("usedModels").textContent=Object.keys(data.providers).length+" evaluators";$("remainingBalance").textContent=account&&Number.isFinite(Number(account.balance_usd))?Number(account.balance_usd).toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:8}):"Unavailable";$("resultArea").classList.remove("hidden");setMessage("checkMessage","Check complete. Your combined Trust Score is ready.");}catch(e){setMessage("checkMessage",e.message||"Could not complete evaluation.",true);if(/insufficient|balance|funds|add funds/i.test(e.message||""))setMessage("checkMessage",e.message+" Open Account to view balance or add funds.",true);if(/401|unauthorized|token|session|sign in/i.test(e.message||""))showView("accountView");}finally{b.disabled=!validWeights();b.textContent="Run Trust Check";}});
$("viewEvidence").addEventListener("click",async()=>{if(!lastResult){setMessage("checkMessage","Run a check first.",true);return;}const s=await getSession();if(!s?.access_token){setMessage("checkMessage","Please log in again before opening evidence.",true);return;}chrome.runtime.sendMessage({type:"OPEN_TRUSTAI_EVIDENCE",result:lastResult,session:s},response=>{if(chrome.runtime.lastError||!response?.ok)setMessage("checkMessage","Could not open the evidence page. Try again.",true);else setMessage("checkMessage","Opening the full evidence page…");});});
(async()=>{try{const saved=await chrome.storage.local.get(["trustAISelectedModels","trustAIModelWeights"]);if(Array.isArray(saved.trustAISelectedModels)){const valid=saved.trustAISelectedModels.filter(id=>CATALOG.some(m=>m.id===id)).slice(0,MAX_MODELS);if(valid.length>=MIN_MODELS)selected=new Set(valid);}if(saved.trustAIModelWeights&&typeof saved.trustAIModelWeights==="object")weights={...weights,...saved.trustAIModelWeights};if(!validWeights())equalize();}catch{}renderModels();renderWeights();updateCost();getSession().then(s=>{if(s?.access_token){$("statusBadge").textContent="SIGNED IN";loadAccount().catch(()=>{});}}).catch(()=>{});})();


const trustyHistory = [];
let trustyBusy = false;
function appendTrustyMessage(role, content, meta) {
 const box=$("trustyMessages");
 if(!trustyHistory.length && box.querySelector(".muted")) box.innerHTML="";
 const item=document.createElement("div");
 item.style.padding="8px 0";
 item.style.borderBottom="1px solid var(--border)";
 const title=document.createElement("strong");
 title.textContent=role==="user"?"You":"Trusty";
 const body=document.createElement("div");
 body.style.whiteSpace="pre-wrap";
 body.style.overflowWrap="anywhere";
 body.style.marginTop="4px";
 body.textContent=content;
 item.append(title,body);
 if(meta){const info=document.createElement("div");info.className="tiny";info.style.marginTop="6px";const bits=[];if(meta.synthesizer?.name)bits.push("Synthesized by "+meta.synthesizer.name);if(typeof meta.cost_usd==="number")bits.push("API cost "+formatMoney(meta.cost_usd));info.textContent=bits.join(" · ");item.append(info);}
 box.append(item);box.scrollTop=box.scrollHeight;
}
async function sendTrustyMessage(){
 const prompt=$("trustyPrompt"),text=prompt.value.trim();
 if(!text||trustyBusy)return;
 let s;
 try{s=await getSession();}catch(e){setMessage("trustyMessage","Could not refresh login. Open Account and sign in again.",true);return;}
 if(!s?.access_token){setMessage("trustyMessage","Please sign in using Account before chatting with Trusty.",true);showView("accountView");return;}
 trustyBusy=true;$("trustySend").disabled=true;$("trustySend").textContent="Working…";prompt.disabled=true;
 appendTrustyMessage("user",text);trustyHistory.push({role:"user",content:text});prompt.value="";
 setMessage("trustyMessage","Six models are drafting, voting, and synthesizing…");
 try{
  const r=await fetch(BACKEND_URL+"/api/trusty/chat",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+s.access_token},body:JSON.stringify({messages:trustyHistory})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||"Trusty could not answer this message ("+r.status+").");
  if(typeof data.answer!=="string"||!data.answer.trim())throw new Error("Trusty returned an empty response.");
  appendTrustyMessage("assistant",data.answer,data);trustyHistory.push({role:"assistant",content:data.answer});
  setMessage("trustyMessage","Trusty replied.");
  if(typeof data.balance_usd==="number"){$("balanceValue").textContent=formatMoney(data.balance_usd);}
 }catch(e){trustyHistory.pop();setMessage("trustyMessage",e.message||"Trusty could not complete this message.",true);}
 finally{trustyBusy=false;$("trustySend").disabled=false;$("trustySend").textContent="Send to Trusty";prompt.disabled=false;prompt.focus();}
}
$("trustySend").addEventListener("click",sendTrustyMessage);
$("trustyPrompt").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendTrustyMessage();}});
$("openTrustyWebsite").addEventListener("click",()=>chrome.tabs.create({url:SITE_URL+"trusty.html"}));
