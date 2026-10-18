const WEBSITE_URL = "https://rat-os-dev.github.io/TrustAI/";
const answerText = document.getElementById("answerText");
const message = document.getElementById("message");
const loadSelection = document.getElementById("loadSelection");
const checkAnswer = document.getElementById("checkAnswer");

loadSelection.addEventListener("click", async () => {
  message.textContent = "";
  loadSelection.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab found.");
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection ? window.getSelection().toString().trim() : ""
    });
    const selection = results && results[0] ? results[0].result : "";
    if (!selection) {
      message.textContent = "No highlighted text found. Select text on the page first, or paste it above.";
      return;
    }
    answerText.value = selection.slice(0, 12000);
    message.textContent = selection.length > 12000
      ? "Loaded the first 12,000 characters."
      : "Highlighted text loaded. Review it before continuing.";
  } catch (error) {
    message.textContent = "This page does not allow text selection access. Paste the answer above instead.";
  } finally {
    loadSelection.disabled = false;
  }
});

checkAnswer.addEventListener("click", async () => {
  const answer = answerText.value.trim();
  if (!answer) {
    message.textContent = "Select or paste an answer first.";
    answerText.focus();
    return;
  }

  let copied = false;
  try {
    answerText.focus();
    answerText.select();
    copied = document.execCommand("copy");
    answerText.setSelectionRange(answer.length, answer.length);
  } catch (_) {
    copied = false;
  }

  try {
    await chrome.tabs.create({ url: WEBSITE_URL });
    message.textContent = copied
      ? "Text copied. Paste it into Trust AI in the new tab."
      : "Trust AI opened. Copy the text here, then paste it into the checker.";
  } catch (_) {
    message.textContent = copied
      ? "Text copied, but the website could not be opened automatically."
      : "Please copy the text and open Trust AI in a tab.";
  }
});
