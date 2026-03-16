import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ArrowLeft } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";

export default function NoOrganization() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>
      
      <Card className="w-full max-w-md border-2">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Building2 className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{t("noOrganization.title")}</CardTitle>
          <CardDescription className="text-base mt-2">
            {t("noOrganization.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            className="w-full bg-brand-gradient text-white hover:opacity-90 text-lg py-6"
            asChild
          >
            <Link to="/?demo=true">
              {t("noOrganization.cta")}
            </Link>
          </Button>
          
          <Button variant="ghost" className="w-full text-muted-foreground" asChild>
            <Link to="/" className="flex items-center justify-center">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("noOrganization.backToLanding")}
            </Link>
          </Button>
        </CardContent>
      </Card>
      
      <div className="mt-8">
        <img 
          src="/logo.png" 
          alt="Picobello" 
          className="h-8 opacity-50 grayscale hover:grayscale-0 transition-all"
        />
      </div>
    </div>
  );
}

