import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    server: { deps: { inline: [/supabase\/functions/] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "https://esm.sh/@supabase/supabase-js@2": "@supabase/supabase-js",
    },
  },
});
