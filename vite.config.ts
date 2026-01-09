import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { execSync } from "child_process";

let commitHash = "unknown";
try {
  commitHash = execSync("git rev-parse --short HEAD").toString().trim();
} catch (e) {
  console.warn("Could not get git commit hash");
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    "import.meta.env.VITE_GIT_SHA": JSON.stringify(commitHash),
  },
});
