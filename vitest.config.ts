import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [react(), tsconfigPaths()],
    test: {
        environment: "jsdom",
        setupFiles: ["__tests__/setup.ts"],
        globals: true,
        coverage: {
            reporter: ["text", "json", "html"],
            exclude: [
                "node_modules/",
                "__tests__/",
                "**/*.d.ts",
                "**/*.config.*",
                "**/types/*",
            ],
        },
    },
});
