import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1e293b" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <path d="M12 46 L26 32 L36 38 L52 20" fill="none" stroke="#f97316" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="12" y="50" width="40" height="3" fill="#94a3b8" />
        </svg>
      </div>
    ),
    size,
  );
}
