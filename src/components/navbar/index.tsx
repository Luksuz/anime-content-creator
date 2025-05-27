'use client'; // Make Navbar a client component

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ModeToggle } from "./mode-toggle";
// import { UserSelector } from '../user-selector'; // UserSelector is removed as per new requirements
import { useAuth } from "@/contexts/AuthContext";

import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Lock, User as UserIcon, LogOut, Sparkles, LayoutDashboard } from "lucide-react";

// NavbarProps might not be needed if selectedUserId and onUserChange are no longer used directly by Navbar
// interface NavbarProps {
//   selectedUserId: string;
//   onUserChange: (userId: string) => void;
// }

// const Navbar = ({ selectedUserId, onUserChange }: NavbarProps) => {
const Navbar = () => {
  const { user, signOut, isLoading, isAdmin } = useAuth();

  return (
    <header className="w-full border-b border-blue-500/20 sticky top-0 z-30 backdrop-blur-md bg-background/80">
      <div className="container p-4 sm:px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-400" />
          <h5 className="font-semibold text-lg gradient-text">AI Content Generator</h5>
        </Link>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              {/* User dropdown menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-full border-blue-500/30 bg-blue-900/10 hover:bg-blue-900/20 shadow-glow-blue">
                    <UserIcon className="h-5 w-5 text-blue-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="backdrop-blur-md bg-blue-900/20 border border-blue-500/30">
                  <DropdownMenuLabel className="glow-text">
                    {user.email || "User"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-blue-500/20" />
                  <DropdownMenuItem asChild className="cursor-pointer hover:bg-blue-800/30 focus:bg-blue-800/30">
                    <Link href="/profile">
                      <UserIcon className="mr-2 h-4 w-4 text-blue-400" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild className="cursor-pointer hover:bg-blue-800/30 focus:bg-blue-800/30">
                      <Link href="/admin">
                        <LayoutDashboard className="mr-2 h-4 w-4 text-blue-400" />
                        <span>Admin Dashboard</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer hover:bg-blue-800/30 focus:bg-blue-800/30">
                    <LogOut className="mr-2 h-4 w-4 text-blue-400" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              {/* If user is not authenticated, show login/register buttons */}
              {!isLoading && (
                <>
                  <Button variant="outline" asChild className="border-blue-500/30 bg-blue-900/10 hover:bg-blue-900/20 text-blue-400">
                    <Link href="/login">Log in</Link>
                  </Button>
                  <Button asChild className="shimmer bg-gradient-to-r from-blue-600/80 to-purple-600/80 border-0 shadow-glow-blue">
                    <Link href="/register">Sign up</Link>
                  </Button>
                </>
              )}
            </>
          )}

          <ModeToggle />
        </div>
      </div>
    </header>
  );
};

export default Navbar;
