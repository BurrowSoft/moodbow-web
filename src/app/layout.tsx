import "./globals.css";

// The <html> element lives in [locale]/layout.tsx so its lang attribute
// follows the page's language. This root layout only exists because Next
// requires one; app/not-found.tsx renders its own <html>.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
