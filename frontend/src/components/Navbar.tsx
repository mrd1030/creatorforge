import React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Moon, Sun, Save, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { getCurrentDraftId } from "@/lib/storage";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { toast } from "sonner";

export default function Navbar() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const loc = useLocation();

  const onSave = () => {
    // Draft is auto-persisted in Composer, but expose explicit feedback
    window.dispatchEvent(new CustomEvent("bf:save-draft"));
    toast.success("Draft saved", { description: "Your work is safely tucked away in this browser." });
  };

  const onExport = () => {
    const id = getCurrentDraftId();
    if (id) navigate(`/finalize/${id}`);
    else toast.message("Start an article first", { description: "Create or open a draft to export." });
  };

  const tabs = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/new", label: "New Article" },
    { to: "/drafts", label: "My Drafts" },
    { to: "/newsletter", label: "Newsletter" },
    { to: "/styles", label: "Style Library" },
    { to: "/settings", label: "Settings" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border glass" data-testid="top-navbar">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <Link to="/dashboard" className="flex items-center gap-2 group" data-testid="logo-link">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-sm group-hover:shadow-md transition-shadow">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-xl font-semibold tracking-tight">{APP_NAME}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground -mt-0.5">{APP_TAGLINE}</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1" data-testid="primary-nav">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to}
              data-testid={`nav-${t.to.replace("/", "")}-link`}
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-full text-sm font-medium transition-all ${
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`
              }>{t.label}</NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle}
            data-testid="theme-toggle-btn"
            aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
          {loc.pathname.startsWith("/new") || loc.pathname.startsWith("/edit") ? (
            <Button variant="outline" size="sm" onClick={onSave} data-testid="save-draft-btn">
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
          ) : null}
          <Button size="sm" onClick={onExport} className="bg-primary hover:bg-primary/90 text-primary-foreground pulse-glow"
            data-testid="navbar-export-btn">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
        </div>
      </div>
    </header>
  );
}
