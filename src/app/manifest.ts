import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "부동산 분석",
    short_name: "부동산 분석",
    start_url: "/",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#1e293b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
