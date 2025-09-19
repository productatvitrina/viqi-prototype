/**
 * NextAuth configuration for ViQi
 */
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import axios from "axios";
import { apiConfig, getApiUrl } from "@/config/api.config";

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
      
      try {
        // Register/login user with backend
        const response = await axios.post(getApiUrl("/api/auth/register"), {
          email: user.email,
          name: user.name,
          auth_provider: account?.provider || "google"
        });
        
        console.log("✅ Backend registration successful:", response.data);
        return true;
        
      } catch (error) {
        console.error("❌ Backend registration failed:", error);
        // Allow sign in even if backend fails (for demo purposes)
        return true;
      }
    },
    
    async jwt({ token, user, account }) {
      console.log("🔑 JWT callback:", { email: token.email });
      
      // On first sign in, get backend token
      if (account && user) {
        try {
          const response = await axios.post(getApiUrl("/api/auth/register"), {
            email: user.email,
            name: user.name,
            auth_provider: account.provider
          });
          
          if (response.data.access_token) {
            token.backendToken = response.data.access_token;
            token.user = response.data.user;
            console.log("✅ Backend token obtained");
          }
        } catch (error) {
          console.error("❌ Failed to get backend token:", error);
        }
      }
      
      return token;
    },
    
    async session({ session, token }) {
      console.log("🎭 Session callback:", { email: session.user?.email });
      
      // Pass backend token and user info to session
      if (token.backendToken) {
        (session as any).backendToken = token.backendToken;
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
