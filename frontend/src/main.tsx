/**
 * main.tsx — React Entry Point with Buffer Polyfill
 *
 * CRITICAL: The Buffer polyfill MUST be set before any Stellar SDK import.
 * The Stellar SDK uses Node.js Buffer internally, which is not available
 * in browser environments. This polyfill bridges that gap.
 */

import { Buffer } from "buffer";
(window as any).Buffer = Buffer;

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./ui.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
