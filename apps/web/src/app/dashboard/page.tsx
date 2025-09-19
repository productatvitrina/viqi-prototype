/**
 * Dashboard page - User statistics, credits, and history
 */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CreditCard, 
  Search, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Calendar,
  Plus,
  Minus,
  Settings,
  LogOut,
  Eye,
  Mail
} from "lucide-react";
import { api, makeAuthenticatedRequest } from "@/lib/api";
import { toast } from "sonner";

interface DashboardStats {
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    credits_balance: number;
    created_at: string;
    company?: {
      id: number;
      name: string;
      domain: string;
    };
  };
  usage: {
    total_queries: number;
    total_contacts_revealed: number;
    total_tokens_used: number;
    total_credits_used: number;
    total_spent_cents: number;
    queries_this_month: number;
    credits_balance: number;
  };
  recent_matches: Array<{
    id: number;
    query: string;
    status: string;
    credit_cost: number;
    created_at: string;
    token_usage: {
      prompt: number;
      completion: number;
      total: number;
    };
  }>;
  recent_payments: Array<{
    id: number;
    amount_cents: number;
    currency: string;
    status: string;
    credits_purchased: number;
    created_at: string;
    plan_name: string;
  }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustingCredits, setAdjustingCredits] = useState(false);

  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Redirect to signin if not authenticated
    if (status === "unauthenticated") {
      router.push("/auth/signin");
      return;
    }

    const loadDashboard = async () => {
      if (status === "loading") return;

      try {
        setIsLoading(true);
        setError(null);

        // For demo, show mock data if no session
        if (!session) {
          const mockStats: DashboardStats = {
            user: {
              id: 1,
              email: "demo@example.com",
              name: "Demo User",
              role: "user",
              credits_balance: 5,
              created_at: new Date().toISOString(),
              company: {
                id: 1,
                name: "Demo Productions",
                domain: "demoproductions.com"
              }
            },
            usage: {
              total_queries: 3,
              total_contacts_revealed: 2,
              total_tokens_used: 4850,
              total_credits_used: 3,
              total_spent_cents: 2900,
              queries_this_month: 2,
              credits_balance: 5
            },
            recent_matches: [
              {
                id: 1,
                query: "Looking for VFX company for sci-fi feature",
                status: "revealed",
                credit_cost: 1,
                created_at: new Date().toISOString(),
                token_usage: { prompt: 850, completion: 420, total: 1270 }
              },
              {
                id: 2,
                query: "Need financing for independent drama",
                status: "preview",
                credit_cost: 1,
                created_at: new Date(Date.now() - 86400000).toISOString(),
                token_usage: { prompt: 920, completion: 380, total: 1300 }
              }
            ],
            recent_payments: [
              {
                id: 1,
                amount_cents: 2900,
                currency: "USD",
                status: "succeeded",
                credits_purchased: 50,
                created_at: new Date().toISOString(),
                plan_name: "Starter"
              }
            ]
          };
          
          setStats(mockStats);
          setIsLoading(false);
          return;
        }

        // Load actual dashboard stats
        const response: DashboardStats = await makeAuthenticatedRequest(() => 
          api.users.getDashboard()
        );

        setStats(response);

      } catch (err: any) {
        console.error("Failed to load dashboard:", err);
        setError(err.message || "Failed to load dashboard");
        toast.error("Failed to load dashboard", {
          description: "Please refresh the page or contact support."
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [session, status, router]);

  const handleAdjustCredits = async (amount: number) => {
    if (!session) return;

    setAdjustingCredits(true);

    try {
      const response = await makeAuthenticatedRequest(() =>
        api.users.adjustCredits(amount)
      );

      if (stats) {
        setStats({
          ...stats,
          user: {
            ...stats.user,
            credits_balance: response.new_balance
          },
          usage: {
            ...stats.usage,
            credits_balance: response.new_balance
          }
        });
      }

      toast.success(`Credits ${amount > 0 ? 'added' : 'removed'}!`, {
        description: `New balance: ${response.new_balance} credits`
      });

    } catch (err: any) {
      toast.error("Failed to adjust credits", {
        description: err.message
      });
    } finally {
      setAdjustingCredits(false);
    }
  };

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/");
    toast.success("Signed out successfully");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="container mx-auto px-4 py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p>Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <div className="text-red-500 mb-4">⚠️</div>
            <h2 className="text-lg font-semibold mb-2">Dashboard Error</h2>
            <p className="text-gray-600 mb-4">{error || "Failed to load dashboard"}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">V</span>
                </div>
                <span className="text-xl font-bold text-gray-900">ViQi AI</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => router.push("/")}
                variant="outline"
                size="sm"
              >
                <Search className="w-4 h-4 mr-2" />
                New Search
              </Button>
              <Button
                onClick={handleSignOut}
                variant="ghost"
                size="sm"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome back, {stats.user.name || stats.user.email}!
            </h1>
            <p className="text-gray-600">
              {stats.user.company ? `${stats.user.company.name} • ` : ""}
              Member since {new Date(stats.user.created_at).toLocaleDateString()}
            </p>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-8 h-8 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.usage.credits_balance}</p>
                    <p className="text-sm text-gray-600">Credits Available</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Search className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.usage.total_queries}</p>
                    <p className="text-sm text-gray-600">Total Searches</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Users className="w-8 h-8 text-purple-600" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stats.usage.total_contacts_revealed}</p>
                    <p className="text-sm text-gray-600">Contacts Revealed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-8 h-8 text-orange-600" />
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(stats.usage.total_spent_cents)}
                    </p>
                    <p className="text-sm text-gray-600">Total Spent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs */}
          <Tabs defaultValue="activity" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="activity">Recent Activity</TabsTrigger>
              <TabsTrigger value="credits">Credits & Billing</TabsTrigger>
              <TabsTrigger value="settings">Account Settings</TabsTrigger>
            </TabsList>

            {/* Recent Activity */}
            <TabsContent value="activity">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Recent Searches */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Search className="w-5 h-5" />
                      <span>Recent Searches</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {stats.recent_matches.map((match) => (
                        <div key={match.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 mb-1">
                              {match.query}
                            </p>
                            <div className="flex items-center space-x-4 text-xs text-gray-500">
                              <span>{formatDate(match.created_at)}</span>
                              <span>•</span>
                              <span>{match.token_usage.total} tokens</span>
                            </div>
                          </div>
                          <div className="ml-4 text-right">
                            <Badge 
                              variant={match.status === "revealed" ? "default" : "secondary"}
                              className="mb-1"
                            >
                              {match.status === "revealed" ? (
                                <><Eye className="w-3 h-3 mr-1" />Revealed</>
                              ) : (
                                "Preview"
                              )}
                            </Badge>
                            <p className="text-xs text-gray-500">{match.credit_cost} credits</p>
                          </div>
                        </div>
                      ))}
                      
                      {stats.recent_matches.length === 0 && (
                        <p className="text-center text-gray-500 py-8">
                          No searches yet. <br />
                          <Button 
                            onClick={() => router.push("/")}
                            variant="link" 
                            className="p-0 h-auto"
                          >
                            Start your first search
                          </Button>
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Usage This Month */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5" />
                      <span>This Month's Activity</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Searches Made</span>
                        <span className="font-semibold">{stats.usage.queries_this_month}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Credits Used</span>
                        <span className="font-semibold">{stats.usage.total_credits_used}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Contacts Revealed</span>
                        <span className="font-semibold">{stats.usage.total_contacts_revealed}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Tokens Consumed</span>
                        <span className="font-semibold">{stats.usage.total_tokens_used.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Credits & Billing */}
            <TabsContent value="credits">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Credits Management */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <CreditCard className="w-5 h-5" />
                      <span>Credits Management</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center mb-6">
                      <div className="text-4xl font-bold text-blue-600 mb-2">
                        {stats.usage.credits_balance}
                      </div>
                      <p className="text-gray-600">Credits Available</p>
                    </div>
                    
                    <div className="space-y-3">
                      <Button
                        onClick={() => router.push("/paywall")}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Purchase More Credits
                      </Button>
                      
                      {/* Demo Credit Adjustment */}
                      <div className="flex space-x-2">
                        <Button
                          onClick={() => handleAdjustCredits(5)}
                          disabled={adjustingCredits}
                          variant="outline"
                          className="flex-1"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add 5
                        </Button>
                        <Button
                          onClick={() => handleAdjustCredits(-1)}
                          disabled={adjustingCredits || stats.usage.credits_balance === 0}
                          variant="outline"
                          className="flex-1"
                        >
                          <Minus className="w-4 h-4 mr-1" />
                          Use 1
                        </Button>
                      </div>
                      <p className="text-xs text-center text-gray-500">
                        Demo: Adjust credits for testing
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment History */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <DollarSign className="w-5 h-5" />
                      <span>Payment History</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.recent_payments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-gray-900">
                              {payment.plan_name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {payment.credits_purchased} credits • {formatDate(payment.created_at)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">
                              {formatCurrency(payment.amount_cents)}
                            </p>
                            <Badge 
                              variant={payment.status === "succeeded" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {payment.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      
                      {stats.recent_payments.length === 0 && (
                        <p className="text-center text-gray-500 py-8">
                          No payments yet
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Account Settings */}
            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="w-5 h-5" />
                    <span>Account Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <p className="text-gray-900">{stats.user.email}</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Display Name
                      </label>
                      <p className="text-gray-900">{stats.user.name || "Not set"}</p>
                    </div>

                    {stats.user.company && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Company
                        </label>
                        <p className="text-gray-900">{stats.user.company.name}</p>
                        <p className="text-sm text-gray-500">{stats.user.company.domain}</p>
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Type
                      </label>
                      <Badge variant="outline" className="capitalize">
                        {stats.user.role}
                      </Badge>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Member Since
                      </label>
                      <p className="text-gray-900">{formatDate(stats.user.created_at)}</p>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <Button variant="outline" className="w-full sm:w-auto">
                        <Settings className="w-4 h-4 mr-2" />
                        Edit Profile
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        className="w-full sm:w-auto"
                        onClick={handleSignOut}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
