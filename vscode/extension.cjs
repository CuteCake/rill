const vscode = require("vscode");
const path = require("node:path");

const extensions = ["mlir", "ir", "ll", "txt", "prototxt", "pbtxt"];

async function open(context, resource, selection) {
  let uris = selection?.length ? selection : resource ? [resource] : [];
  if (!uris.length) {
    const active = vscode.window.activeTextEditor?.document;
    if (active && extensions.includes(path.extname(active.uri.path).slice(1).toLowerCase())) {
      uris = [active.uri];
    } else {
      uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        filters: { "Compiler IR": extensions },
        openLabel: "Open in Rill",
      });
    }
  }
  if (!uris?.length) return;

  const files = await Promise.all(uris.map(async (uri) => {
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    const text = doc ? doc.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    return { name: path.posix.basename(uri.path), text };
  }));

  const media = vscode.Uri.joinPath(context.extensionUri, "media");
  const title = files.length === 1 ? files[0].name : `${files.length} snapshots`;
  const panel = vscode.window.createWebviewPanel("rill.viewer", `Rill · ${title}`, vscode.ViewColumn.Active, {
    enableScripts: true, localResourceRoots: [media], retainContextWhenHidden: true,
  });
  const webview = panel.webview;
  webview.onDidReceiveMessage(async (message) => {
    if (message?.type === "ready") {
      await webview.postMessage({ type: "load", files });
    } else if (message?.type === "save" && typeof message.text === "string") {
      try {
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.joinPath(uris[0], "..", path.basename(message.name)),
          filters: { "Rill session": ["json"] },
        });
        if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(message.text));
      } catch (err) {
        vscode.window.showErrorMessage(`Rill could not save the session: ${err.message}`);
      }
    }
  });
  const script = webview.asWebviewUri(vscode.Uri.joinPath(media, "viewer.js"));
  webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource}; style-src 'unsafe-inline'; img-src data:;">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#090b10;color:#bfc5d2;overflow:hidden}</style>
    </head><body><div id="root"></div><script src="${script}"></script></body></html>`;
}

exports.activate = (context) => {
  context.subscriptions.push(vscode.commands.registerCommand("rill.open", (...args) =>
    open(context, ...args).catch((err) => vscode.window.showErrorMessage(`Could not open Rill: ${err.message}`))
  ));
};
