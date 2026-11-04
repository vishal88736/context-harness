import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles.css";
import "./home-page.css";
import "./appearance.css";
import { AppearanceProvider } from "./appearance";
import { HomePage } from "./components/HomePage";
import { Downloads } from "./components/Downloads";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppearanceProvider>
      <HomePage
        hasWorkspace={false}
        onOpenWorkspace={() => {}}
        downloadUrl="#download"
        downloads={<Downloads />}
      />
    </AppearanceProvider>
  </React.StrictMode>,
);
