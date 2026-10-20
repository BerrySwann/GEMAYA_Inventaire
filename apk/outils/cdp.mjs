/*
 * Petit client DevTools pour piloter la page de l'application pendant les tests.
 *
 * Le WebView n'expose le transport que si l'application est compilee en debug
 * (voir MainActivity : FLAG_DEBUGGABLE). Le port est redirige depuis le poste :
 *   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
 *
 * Usage : node outils/cdp.mjs "<expression javascript>"
 */
const expression = (process.argv[2] || "").replace(/%%CLE_API%%/g, process.env.CLE_API || "");
if (!expression) {
  console.error("usage: node outils/cdp.mjs \"<expression>\"");
  process.exit(2);
}

const cibles = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = cibles.find(c => (c.url || "").includes("index.html")) || cibles[0];
if (!page) {
  console.error("aucune page dans le WebView");
  process.exit(3);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
const delai = setTimeout(() => { console.error("delai depasse"); process.exit(4); }, 60000);

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression, returnByValue: true, awaitPromise: true }
  }));
});

ws.addEventListener("message", (evenement) => {
  const message = JSON.parse(evenement.data);
  if (message.id !== 1) { return; }
  clearTimeout(delai);
  if (message.result && message.result.exceptionDetails) {
    console.error("erreur JS : " + JSON.stringify(message.result.exceptionDetails.exception));
    process.exit(5);
  }
  console.log(JSON.stringify(message.result && message.result.result ? message.result.result.value : null));
  ws.close();
  process.exit(0);
});
