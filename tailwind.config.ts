import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2933",
        panel: "#f7f9fb",
        line: "#d9e2ec",
        brand: "#0f766e",
        amber: "#b7791f",
        berry: "#9f1239"
      }
    }
  },
  plugins: []
};

export default config;

