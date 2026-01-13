import "./globals.css";

export const metadata = {
  title: "Book Finder",
  description: "Mobile-first ISBN scanner and catalog"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
