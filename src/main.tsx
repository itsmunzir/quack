import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyGlow, applyMode, loadGlow, loadMode } from "./themes";
import "./styles.css";

applyMode(loadMode());
applyGlow(loadGlow());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
