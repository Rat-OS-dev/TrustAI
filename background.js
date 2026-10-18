const SITE_URL = "https://rat-os-dev.github.io/TrustAI/";
const AUTH_STORAGE_KEY = "trustAIAuthSession";
const HANDOFF_KEY = "trustAIEvidenceHandoff";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "OPEN_TRUSTAI_EVIDENCE") return;
  (async () => {
    const result = message.result;
    const session = message.session;
    if (!result || typeof result.trustScore !== "number" || !session?.access_token) {
      sendResponse({ok:false});
      return;
    }
    const tab = await chrome.tabs.create({url:SITE_URL+"login.html?mode=login"});
    await chrome.storage.session.set({[HANDOFF_KEY]:{tabId:tab.id,result,session,phase:"session"}});
    sendResponse({ok:true});
  })().catch(() => sendResponse({ok:false}));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url || !tab.url.startsWith(SITE_URL)) return;
  (async () => {
    const data = await chrome.storage.session.get(HANDOFF_KEY);
    const handoff = data[HANDOFF_KEY];
    if (!handoff || handoff.tabId !== tabId) return;
    if (handoff.phase === "session") {
      const session = handoff.session;
      const supabaseStorage = {
        access_token:session.access_token,
        token_type:session.token_type || "bearer",
        expires_in:session.expires_in || 3600,
        expires_at:session.expires_at || Math.floor(Date.now()/1000)+(session.expires_in||3600),
        refresh_token:session.refresh_token,
        user:session.user
      };
      await chrome.scripting.executeScript({
        target:{tabId},
        func:(value)=>{localStorage.setItem("sb-iirxewgecavovbasafud-auth-token",JSON.stringify(value));},
        args:[supabaseStorage]
      });
      await chrome.storage.session.set({[HANDOFF_KEY]:{...handoff,phase:"render"}});
      await chrome.tabs.update(tabId,{url:SITE_URL+"index.html"});
      return;
    }
    if (handoff.phase === "render") {
      await chrome.scripting.executeScript({
        target:{tabId},
        func:(result)=>{
          const evidenceButton=document.querySelector('[data-page="evidencePage"]');
          if(evidenceButton)evidenceButton.click();
          const score=document.getElementById("overallTrustScore");
          if(score)score.textContent=String(Math.round(result.trustScore));
          const container=document.getElementById("evidenceContainer");
          if(!container)return;
          container.replaceChildren();
          const note=document.createElement("p");
          note.className="description";
          note.textContent="Evidence imported from your Chrome extension check. Actual cost: "+(typeof result.billing?.cost_usd==="number"?"$"+result.billing.cost_usd.toFixed(8):"not returned")+".";
          container.append(note);
          for(const [id,p] of Object.entries(result.providers||{})){
            const box=document.createElement("div");box.className="ai-evidence-box";
            const title=document.createElement("h3");title.textContent=(p.name||id)+" Evidence";box.append(title);
            const confidenceLabel=document.createElement("div");confidenceLabel.className="confidence-label";confidenceLabel.textContent="Confidence Score";box.append(confidenceLabel);
            const confidence=document.createElement("div");confidence.className="confidence-score";confidence.textContent=String(Math.round(Number(p.confidenceScore)||0));box.append(confidence);
            const evidenceLabel=document.createElement("div");evidenceLabel.className="evidence-label";evidenceLabel.textContent="Evidence";box.append(evidenceLabel);
            const content=document.createElement("div");content.className="evidence-content";
            const items=Array.isArray(p.evidence)?p.evidence:[];
            content.textContent=items.map(item=>"Claim: "+(typeof item?.claim==="string"?item.claim:"Claim not specified")+"\nStatus: "+(typeof item?.status==="string"?item.status:"unverified")+"\nExplanation: "+(typeof item?.explanation==="string"?item.explanation:"No explanation.")).join("\n\n")||"No evidence details returned.";
            box.append(content);container.append(box);
          }
        },
        args:[handoff.result]
      });
      await chrome.storage.session.remove(HANDOFF_KEY);
    }
  })().catch(()=>{});
});
