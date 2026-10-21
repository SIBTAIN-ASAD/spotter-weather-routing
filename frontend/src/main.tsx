import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import FuelApp from "./FuelApp";
import "leaflet/dist/leaflet.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/fuel") ? <FuelApp /> : <App />}
  </React.StrictMode>,
);
