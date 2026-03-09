import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * 返回 Vite 构建配置。
 *
 * Returns:
 *   Vite 的开发与构建配置对象。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
});
