import { Link, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Workflow,
  Zap,
  Users,
  FileText,
  Bot,
  ArrowRight,
  CheckCircle2,
  PlayCircle,
  Network,
  Shield,
  BarChart3,
  Sparkles,
  Loader2,
  HardHat,
  DollarSign,
  ShoppingCart,
  Laptop,
  Scale,
  Cog,
  UserPlus,
  UserCheck,
  Calendar,
  Receipt,
  Wallet,
  CreditCard,
  ShoppingBag,
  Building2,
  FileCheck,
  ClipboardCheck,
  Key,
  Package,
  AlertCircle,
  Settings,
  FileSearch,
  ShieldCheck,
  Lock,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSelector } from "@/components/LanguageSelector";
import { RotatingText } from "@/components/RotatingText";
import { api } from "@/lib/api";
import { toast } from "sonner";
import useCasesData from "@/data/useCases.json";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { LandingCanvas } from "@/components/LandingCanvas";

// Icon mapping for dynamic icon rendering
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  DollarSign,
  ShoppingCart,
  Laptop,
  Scale,
  Cog,
  UserPlus,
  UserCheck,
  Calendar,
  Receipt,
  Wallet,
  CreditCard,
  ShoppingBag,
  Building2,
  FileCheck,
  ClipboardCheck,
  Key,
  Package,
  AlertCircle,
  Settings,
  FileSearch,
  ShieldCheck,
  Lock,
  Wrench,
  AlertTriangle,
  Workflow,
  FileText,
  BarChart3,
  CheckCircle2,
};

export default function LandingPage() {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [demoDialogOpen, setDemoDialogOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const [demoForm, setDemoForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    companyName: "",
  });

  // Check for demo=true in URL to automatically open dialog
  useEffect(() => {
    if (searchParams.get("demo") === "true") {
      setDemoDialogOpen(true);
      // Clean up the URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("demo");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Prefill form when user or profile is available
  useEffect(() => {
    if (user || profile) {
      const email = user?.email || profile?.email || "";
      let firstName = "";
      let lastName = "";

      if (profile?.full_name) {
        const parts = profile.full_name.trim().split(/\s+/);
        if (parts.length > 0) {
          firstName = parts[0];
          if (parts.length > 1) {
            lastName = parts.slice(1).join(" ");
          }
        }
      }

      setDemoForm(prev => ({
        ...prev,
        email: prev.email || email,
        firstName: prev.firstName || firstName,
        lastName: prev.lastName || lastName,
      }));
    }
  }, [user, profile]);

  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [showAllUseCases, setShowAllUseCases] = useState(false);

  // Get all workflows from filtered departments, shuffle them, and limit to 10
  const displayedWorkflows = useMemo(() => {
    // Get all workflows from filtered departments
    const allWorkflows = useCasesData.departments
      .filter((dept) => selectedDepartment === null || selectedDepartment === dept.id)
      .flatMap((dept) =>
        dept.workflows.map((workflow) => ({
          ...workflow,
          departmentId: dept.id,
          departmentIcon: dept.icon,
        }))
      );

    // Shuffle array randomly
    const shuffled = [...allWorkflows].sort(() => Math.random() - 0.5);

    // Limit to 10 if not showing all
    return showAllUseCases ? shuffled : shuffled.slice(0, 10);
  }, [selectedDepartment, showAllUseCases]);

  const totalWorkflows = useMemo(() => {
    return useCasesData.departments
      .filter((dept) => selectedDepartment === null || selectedDepartment === dept.id)
      .reduce((sum, dept) => sum + dept.workflows.length, 0);
  }, [selectedDepartment]);

  const handleDemoRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setDemoLoading(true);

    try {
      await api.post(
        "/api/public/demo-request",
        {
          firstName: demoForm.firstName,
          lastName: demoForm.lastName,
          email: demoForm.email,
          companyName: demoForm.companyName,
        },
        { skipAuth: true }
      );
      toast.success(t("demo.success"));
      setDemoDialogOpen(false);
      setDemoForm({
        firstName: "",
        lastName: "",
        email: "",
        companyName: "",
      });
    } catch (error: any) {
      toast.error(error.message || t("demo.error"));
    } finally {
      setDemoLoading(false);
    }
  };

  const features = [
    {
      icon: Workflow,
      title: t("features.visualWorkflows.title"),
      description: t("features.visualWorkflows.description"),
    },
    {
      icon: Bot,
      title: t("features.aiAssisted.title"),
      description: t("features.aiAssisted.description"),
    },
    {
      icon: PlayCircle,
      title: t("features.realtimeExecution.title"),
      description: t("features.realtimeExecution.description"),
    },
    {
      icon: FileText,
      title: t("features.documentManagement.title"),
      description: t("features.documentManagement.description"),
    },
    {
      icon: Network,
      title: t("features.apiIntegrations.title"),
      description: t("features.apiIntegrations.description"),
    },
    {
      icon: Users,
      title: t("features.multiTenant.title"),
      description: t("features.multiTenant.description"),
    },
    {
      icon: Shield,
      title: t("features.security.title"),
      description: t("features.security.description"),
    },
    {
      icon: BarChart3,
      title: t("features.analytics.title"),
      description: t("features.analytics.description"),
    },
  ];

  const steps = [
    {
      number: "1",
      title: t("howItWorks.step1.title"),
      description: t("howItWorks.step1.description"),
    },
    {
      number: "2",
      title: t("howItWorks.step2.title"),
      description: t("howItWorks.step2.description"),
    },
    {
      number: "3",
      title: t("howItWorks.step3.title"),
      description: t("howItWorks.step3.description"),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <img 
                src="/logo.png" 
                alt="Floowly" 
                className="h-8 w-auto object-contain"
              />
            </div>
            <div className="flex items-center gap-4">
              <LanguageSelector />
              {user ? (
                <Button 
                  className="bg-gradient-to-r from-violet-500 to-purple-700 hover:from-violet-600 hover:to-purple-800"
                  asChild
                >
                  <Link to="/app">{t("nav.dashboard")}</Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" asChild className="hidden sm:inline-flex">
                    <Link to="/auth">{t("nav.login")}</Link>
                  </Button>
                  <Button 
                    className="bg-gradient-to-r from-violet-500 to-purple-700 hover:from-violet-600 hover:to-purple-800"
                    onClick={() => setDemoDialogOpen(true)}
                  >
                    {t("nav.getStarted")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-16 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.1),transparent_70%)] pointer-events-none" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-gradient-to-r from-muted/60 via-muted/50 to-muted/60 backdrop-blur-sm px-4 py-2 text-sm shadow-sm">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <span className="text-muted-foreground">
              {t("hero.badge")}
            </span>
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl text-center">
            {(() => {
              const title = t("hero.title");
              if (typeof title === "string") {
                const parts = title.split("{rotating}");
                // Séparer "Floowly," du reste
                const firstPart = parts[0].trim();
                const floowlyPart = firstPart.split(",")[0] + ",";
                const restOfFirstPart = firstPart.split(",").slice(1).join(",").trim();
                
                // Séparer tous les mots pour un meilleur contrôle responsive
                const wordsBefore = restOfFirstPart ? restOfFirstPart.split(" ").filter(word => word.length > 0) : [];
                const wordsAfter = parts[1] ? parts[1].trim().split(" ").filter(word => word.length > 0) : [];
                
                return (
                  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    <div className="inline-block">{floowlyPart}</div>
                    {wordsBefore.map((word, index) => (
                      <div key={`before-${index}`} className="inline-block">{word}</div>
                    ))}
                    <div className="inline-flex items-center">
                      <RotatingText 
                        words={Array.isArray(t("hero.rotatingWords")) ? t("hero.rotatingWords") as string[] : []} 
                        className="bg-gradient-to-r from-violet-600 via-purple-600 to-violet-600 bg-clip-text text-transparent text-4xl sm:text-6xl lg:text-7xl font-bold"
                      />
                    </div>
                    {wordsAfter.map((word, index) => (
                      <div key={`after-${index}`} className="inline-block">{word}</div>
                    ))}
                  </div>
                );
              }
              return null;
            })()}
          </h1>
          <p className="mb-10 text-lg text-muted-foreground sm:text-xl lg:text-2xl">
            {t("hero.subtitle")}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="bg-gradient-to-r from-violet-500 to-purple-700 hover:from-violet-600 hover:to-purple-800 text-lg px-8 py-6"
              onClick={() => setDemoDialogOpen(true)}
            >
              {t("hero.ctaPrimary")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-50/30 via-transparent to-purple-50/20 dark:from-violet-950/10 dark:via-transparent dark:to-purple-950/5 pointer-events-none" />
        <div className="relative mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            {t("useCases.title")}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t("useCases.subtitle")}
          </p>
        </div>

        {/* Department Filter */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          <Button
            variant={selectedDepartment === null ? "default" : "outline"}
            onClick={() => {
              setSelectedDepartment(null);
              setShowAllUseCases(false);
            }}
            className="bg-gradient-to-r from-violet-500 to-purple-700 hover:from-violet-600 hover:to-purple-800"
          >
            {t("useCases.filterAll")}
          </Button>
          {useCasesData.departments.map((dept) => {
            const IconComponent = iconMap[dept.icon] || Users;
            return (
              <Button
                key={dept.id}
                variant={selectedDepartment === dept.id ? "default" : "outline"}
                onClick={() => {
                  setSelectedDepartment(dept.id);
                  setShowAllUseCases(false);
                }}
                className={selectedDepartment === dept.id ? "bg-gradient-to-r from-violet-500 to-purple-700 hover:from-violet-600 hover:to-purple-800" : ""}
              >
                <IconComponent className="mr-2 h-4 w-4" />
                {t(`useCases.departments.${dept.id}`)}
              </Button>
            );
          })}
        </div>

        {/* Use Cases Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8 relative">
          {displayedWorkflows.map((workflow) => {
            const WorkflowIcon = iconMap[workflow.icon] || Workflow;
            const DeptIcon = iconMap[workflow.departmentIcon] || Users;
            return (
              <Card key={`${workflow.departmentId}-${workflow.id}`} className="border-2 hover:border-violet-500/50 transition-all duration-300 bg-gradient-to-br from-background via-background to-muted/20 hover:shadow-lg hover:shadow-violet-500/10 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-700/10 flex-shrink-0">
                      <WorkflowIcon className="h-5 w-5 text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <CardTitle className="text-lg">
                          {t(`useCases.workflows.${workflow.titleKey}`)}
                        </CardTitle>
                      </div>
                      <div className="mb-2">
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          <DeptIcon className="h-3 w-3" />
                          {t(`useCases.departments.${workflow.departmentId}`)}
                        </Badge>
                      </div>
                      <CardDescription className="text-sm">
                        {t(`useCases.workflows.${workflow.descriptionKey}`)}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        {/* Show More/Less Button */}
        {totalWorkflows > 10 && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => setShowAllUseCases(!showAllUseCases)}
              className="bg-gradient-to-r from-violet-500 to-purple-700 hover:from-violet-600 hover:to-purple-800 text-white border-0"
            >
              {showAllUseCases ? t("useCases.showLess") : t("useCases.showMore")}
              {!showAllUseCases && ` (${totalWorkflows - 10} ${t("useCases.more")})`}
            </Button>
          </div>
        )}
      </section>

      {/* Canvas Preview Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-50/20 via-transparent to-purple-50/20 dark:from-violet-950/10 dark:via-transparent dark:to-purple-950/10 pointer-events-none" />
        <div className="relative mx-auto max-w-4xl text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            {t("canvas.title")}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t("canvas.subtitle")}
          </p>
        </div>
        <div className="relative max-w-6xl mx-auto">
          <LandingCanvas />
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 relative">
        <div className="absolute inset-0 bg-gradient-to-tl from-purple-50/20 via-transparent to-violet-50/30 dark:from-purple-950/5 dark:via-transparent dark:to-violet-950/10 pointer-events-none" />
        <div className="relative mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            {t("features.title")}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t("features.subtitle")}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 relative">
          {features.map((feature, index) => (
            <Card key={index} className="border-2 hover:border-violet-500/50 transition-all duration-300 bg-gradient-to-br from-background via-background to-muted/30 hover:shadow-lg hover:shadow-purple-500/10 backdrop-blur-sm">
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-700/10">
                  <feature.icon className="h-6 w-6 text-violet-600" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it Works Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/40 via-muted/20 to-violet-50/30 dark:from-muted/30 dark:via-muted/10 dark:to-violet-950/10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(139,92,246,0.08),transparent_50%)] pointer-events-none" />
        <div className="relative mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            {t("howItWorks.title")}
          </h2>
          <p className="text-lg text-muted-foreground">
            {t("howItWorks.subtitle")}
          </p>
        </div>
        <div className="mx-auto max-w-5xl relative">
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-full w-full h-0.5 bg-gradient-to-r from-violet-500 to-purple-700 -z-10" style={{ width: 'calc(100% - 4rem)', marginLeft: '2rem' }} />
                )}
                <Card className="relative border-2 hover:border-violet-500/50 transition-all duration-300 bg-gradient-to-br from-background/95 via-background/90 to-muted/40 hover:shadow-xl hover:shadow-violet-500/15 backdrop-blur-sm">
                  <CardHeader>
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-700 text-white text-2xl font-bold">
                      {step.number}
                    </div>
                    <CardTitle className="text-2xl">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {step.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-50/40 via-purple-50/30 to-violet-50/40 dark:from-violet-950/20 dark:via-purple-950/15 dark:to-violet-950/20 pointer-events-none" />
        <Card className="relative border-2 border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-purple-500/8 to-violet-500/10 hover:border-violet-500/40 transition-all duration-300 shadow-xl shadow-violet-500/10 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl sm:text-4xl mb-4">
              {t("cta.title")}
            </CardTitle>
            <CardDescription className="text-lg">
              {t("cta.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-gradient-to-r from-violet-500 to-purple-700 hover:from-violet-600 hover:to-purple-800 text-lg px-8"
              onClick={() => setDemoDialogOpen(true)}
            >
              {t("hero.ctaPrimary")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/40 via-muted/30 to-muted/20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(139,92,246,0.06),transparent_50%)] pointer-events-none" />
        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <img 
                  src="/logo.png" 
                  alt="Floowly" 
                  className="h-8"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {t("footer.tagline")}
              </p>
            </div>
            <div>
              <h3 className="mb-4 font-semibold">{t("footer.product")}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/auth" className="hover:text-foreground transition-colors">{t("footer.features")}</Link></li>
                <li><Link to="/auth" className="hover:text-foreground transition-colors">{t("footer.pricing")}</Link></li>
                <li><Link to="/auth" className="hover:text-foreground transition-colors">{t("footer.documentation")}</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 font-semibold">{t("footer.company")}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/auth" className="hover:text-foreground transition-colors">{t("footer.about")}</Link></li>
                <li><Link to="/auth" className="hover:text-foreground transition-colors">{t("footer.blog")}</Link></li>
                <li><Link to="/auth" className="hover:text-foreground transition-colors">{t("footer.careers")}</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 font-semibold">{t("footer.support")}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/auth" className="hover:text-foreground transition-colors">{t("footer.help")}</Link></li>
                <li><Link to="/auth" className="hover:text-foreground transition-colors">{t("footer.contact")}</Link></li>
                <li><Link to="/auth" className="hover:text-foreground transition-colors">{t("footer.status")}</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Floowly. {t("footer.copyright")}</p>
          </div>
        </div>
      </footer>

      {/* Demo Dialog */}
      <Dialog open={demoDialogOpen} onOpenChange={setDemoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("demo.title")}</DialogTitle>
            <DialogDescription>
              {t("demo.description")}
            </DialogDescription>
          </DialogHeader>
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <HardHat className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-900 dark:text-blue-100">
              {t("demo.betaNotice")}
            </AlertDescription>
          </Alert>
          <form onSubmit={handleDemoRequest} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="demo-firstname">{t("demo.firstName")}</Label>
              <Input
                id="demo-firstname"
                type="text"
                placeholder={t("demo.firstNamePlaceholder") as string}
                value={demoForm.firstName}
                onChange={(e) => setDemoForm({ ...demoForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-lastname">{t("demo.lastName")}</Label>
              <Input
                id="demo-lastname"
                type="text"
                placeholder={t("demo.lastNamePlaceholder") as string}
                value={demoForm.lastName}
                onChange={(e) => setDemoForm({ ...demoForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-email">{t("demo.email")}</Label>
              <Input
                id="demo-email"
                type="email"
                placeholder={t("demo.emailPlaceholder") as string}
                value={demoForm.email}
                onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-company">{t("demo.companyName")}</Label>
              <Input
                id="demo-company"
                type="text"
                placeholder={t("demo.companyNamePlaceholder") as string}
                value={demoForm.companyName}
                onChange={(e) => setDemoForm({ ...demoForm, companyName: e.target.value })}
                required
              />
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setDemoDialogOpen(false)}
                disabled={demoLoading}
              >
                {t("demo.cancel")}
              </Button>
              <Button type="submit" disabled={demoLoading}>
                {demoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("demo.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
