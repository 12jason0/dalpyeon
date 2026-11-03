import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "디어데이",
    short_name: "디어데이",
    description: "말하기 어려운 날에도, 서로의 편.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF4F1",
    theme_color: "#FBF4F1",
    lang: "ko",
    icons: [
      // npm run icons가 public/brand/icon-source.png에서 만든다
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
