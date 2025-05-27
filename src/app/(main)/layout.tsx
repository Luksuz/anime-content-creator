// Removed Navbar and Footer imports
import { AuthProvider } from "@/contexts/AuthContext"; // Import AuthProvider

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Wrap children with AuthProvider
    <AuthProvider>
      <>{children}</>
    </AuthProvider>
  );
}
