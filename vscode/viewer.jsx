import React from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App.jsx";

const host = acquireVsCodeApi();
const root = createRoot(document.getElementById("root"));

function saveJSON(obj, name) {
  host.postMessage({ type: "save", name, text: JSON.stringify(obj, null, 2) });
}

function load(event) {
  if (event.data?.type !== "load") return;
  window.removeEventListener("message", load);
  root.render(<App initialFiles={event.data.files} saveJSON={saveJSON} />);
}

window.addEventListener("message", load);
host.postMessage({ type: "ready" });
