import type { ReactNode } from "react";

export const metadata = {
  title: "PickForMe",
  description: "PickForMe Support und Datenschutz"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body style={{
        margin: 0,
        background: "#f7f4ee",
        color: "#152033",
        fontFamily: "Arial, Helvetica, sans-serif"
      }}>
        {children}
      </body>
    </html>
  );
}
