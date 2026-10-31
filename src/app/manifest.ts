import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "달편",
    short_name: "달편",
    description: "말하기 어려운 날에도, 서로의 편.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f2",
    theme_color: "#f7f5f2",
    lang: "ko",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
