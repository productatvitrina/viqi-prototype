/**
 * NextAuth configuration for ViQi
 */
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid profile email"
        }
      }
    }),
    // LinkedIn can be added here once business verification is complete
  ],
  
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  
  callbacks: {
    async signIn({ user, account, profile }) {
      console.log("🔐 SignIn callback:", { user: user.email, provider: account?.provider });
      // Session-only authentication - no backend calls needed
      return true;
    },
    
    async jwt({ token, user, account }) {
      console.log("🔑 JWT callback:", { email: token.email });
      
      // On first sign in, store user info in token for session
      if (account && user) {
        token.user = {
          email: user.email,
          name: user.name,
          provider: account.provider
        };
        console.log("✅ User info stored in session");
      }
      
      return token;
    },
    
    async session({ session, token }) {
      console.log("🎭 Session callback:", { email: session.user?.email });
      
      // Pass user info to session (session-only, no database)
      if (token.user) {
        (session as any).user = {
          ...session.user,
          ...(token.user as any)
        };
      }
      
      return session;
    }
  },
  
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development"
};

// Helper function to get domain from email
export const getDomainFromEmail = (email: string): string | null => {
  if (!email || !email.includes('@')) return null;
  
  const domain = email.split('@')[1].toLowerCase();
  
  // Skip common free email providers
  const freeProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'protonmail.com', 'aol.com'
  ];
  
  return freeProviders.includes(domain) ? null : domain;
};

// Helper to extract company info from session
export const getCompanyFromSession = (session: any) => {
  return session?.user?.company || null;
};

export default authOptions;
