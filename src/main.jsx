import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import FoundationGate from "./foundation/FoundationGate";
import "./styles.css";

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FoundationGate>
      {(foundation) => <App foundation={foundation} />}
    </FoundationGate>
  </React.StrictMode>
);
