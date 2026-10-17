"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard,CheckSquare,DollarSign,Users,FolderKanban,Bot,Lightbulb,Calendar,Settings,FolderOpen,Menu,X } from "lucide-react";
import { cn } from "@/lib/utils";

// V1 core modules (top)
const primaryNav=[{
  href: "/",
  icon: LayoutDashboard,
  label: "Home"
},{
  href: "/tarefas",
  icon: CheckSquare,
  label: "Tarefas"
},{
  href: "/financeiro",
  icon: DollarSign,
  label: "Financeiro"
},{
  href: "/alunos",
  icon: Users,
  label: "Alunos"
}];

// Secondary modules
const secondaryNav=[{
  href: "/crm",
  icon: FolderKanban,
  label: "CRM"
},{
  href: "/agenda",
  icon: Calendar,
  label: "Agenda"
},{
  href: "/projetos",
  icon: FolderOpen,
  label: "Projetos"
},{
  href: "/openclaw",
  icon: Bot,
  label: "Automações"
}];

// Coming soon (greyed out, no href)
const comingSoon=[{
  icon: Lightbulb,
  label: "Ideias"
}];
function NavItem({
  href,
  icon: Icon,
  label,
  active
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
}) {
  return <Link href={href} aria-current={active? "page":undefined} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",active? "text-white":"hover:text-white")} style={active? {
    background: "#6366f1"
  }:{
    color: "#a5b4fc"
  }}>
    <Icon className="w-4 h-4 flex-shrink-0" />
    {label}
  </Link>;
}
export default function Sidebar() {
  const pathname=usePathname();
  const [mobileOpen,setMobileOpen]=useState(false);
  function isActive(href: string) {
    return href==="/"? pathname==="/":pathname.startsWith(href);
  }
  return <>
    <button aria-label={mobileOpen? "Fechar navegação":"Abrir navegação"} aria-expanded={mobileOpen} aria-controls="dashboard-navigation" onClick={() => setMobileOpen(!mobileOpen)} className="fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#1e1b4b] text-white shadow-lg md:hidden">
      {mobileOpen? <X size={22} />:<Menu size={22} />}
    </button>
    {mobileOpen&&<button aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-20 bg-black/40 md:hidden" />}
    <aside id="dashboard-navigation" onClick={event => {
      if((event.target as HTMLElement).closest("a")) setMobileOpen(false);
    }} className={`${mobileOpen? "flex":"hidden"} fixed left-0 top-0 z-30 md:relative md:z-auto md:flex w-60 flex-shrink-0 flex-col h-dvh md:sticky md:top-0`} style={{
      background: "#1e1b4b"
    }}>
      {/* Logo */}
      <div className="px-5 py-5" style={{
        borderBottom: "1px solid rgba(255,255,255,0.08)"
      }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0" style={{
            background: "#6366f1"
          }}>

            FGT

          </div>
          <div>
            <p className="font-semibold text-sm text-white leading-none">
              Sistema FGT
            </p>
            <p className="text-xs mt-0.5" style={{
              color: "#a5b4fc"
            }}>
              Consultoria Fitness
            </p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {/* Primary — V1 core */}
        {primaryNav.map(({
          href,
          icon,
          label
        }) => <NavItem key={href} href={href} icon={icon} label={label} active={isActive(href)} />)}
        {/* Divider */}
        <div className="py-2">
          <div style={{
            height: "1px",
            background: "rgba(255,255,255,0.08)"
          }} />
        </div>
        {/* Secondary */}
        {secondaryNav.map(({
          href,
          icon,
          label
        }) => <NavItem key={href} href={href} icon={icon} label={label} active={isActive(href)} />)}
        {/* Divider */}
        <div className="py-2">
          <div style={{
            height: "1px",
            background: "rgba(255,255,255,0.08)"
          }} />
        </div>
        {/* Coming soon */}
        <p className="px-3 pt-1 pb-1 text-xs font-semibold uppercase tracking-widest" style={{
          color: "rgba(165,180,252,0.4)"
        }}>

          Em breve

        </p>
        {comingSoon.map(({
          icon: Icon,
          label
        }) => <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-not-allowed" style={{
          color: "rgba(165,180,252,0.35)"
        }}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </div>)}
      </nav>
      {/* User + settings */}
      <div className="px-3 py-4" style={{
        borderTop: "1px solid rgba(255,255,255,0.08)"
      }}>
        <Link href="/configuracoes" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:text-white mb-2" style={{
          color: "#a5b4fc"
        }}>
          <Settings className="w-4 h-4" />

          Configurações

        </Link>
        <div className="px-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{
            background: "#6366f1"
          }}>

            FG

          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">
              Fernando Gomes
            </p>
            <p className="text-xs truncate" style={{
              color: "#a5b4fc"
            }}>
              fgt.consultorias@gmail.com
            </p>
          </div>
        </div>
      </div>
    </aside>
  </>;
}
