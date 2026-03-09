import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

/**
 * 渲染应用入口。
 *
 * Returns:
 *   无返回值。该函数将 React 应用挂载到根节点。
 */
function bootstrapApplication(): void {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error("未找到根节点 #root。");
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrapApplication();
