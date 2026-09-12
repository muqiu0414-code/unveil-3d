import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    target: "es2022",
    // cache-friendly chunking: three / gsap+lenis / app
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/gsap") || id.includes("node_modules/lenis")) return "anim";
          if (id.includes("node_modules")) return "vendor";
          return undefined;
        }
      }
    }
  }
});
