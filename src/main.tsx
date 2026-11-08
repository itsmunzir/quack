import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyGlow, loadGlow } from "./themes";
import "./styles.css";

applyGlow(loadGlow());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
