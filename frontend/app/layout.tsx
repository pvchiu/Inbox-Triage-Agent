export const metadata = { title: "Inbox Triage Agent" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f6f7f9", color: "#1a1a1a" }}>
        {children}
      </body>
    </html>
  );
}
