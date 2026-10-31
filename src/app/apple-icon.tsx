import { ImageResponse } from "next/og";
import { Moon } from "./_components/moon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<Moon size={180} />, size);
}
