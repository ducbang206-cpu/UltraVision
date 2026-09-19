import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./warehouse.css";

export const metadata: Metadata = {
  title: "Kiểm tra vị trí hàng hóa",
  description: "Kiểm tra SKU, Bin và quy tắc ABC",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
