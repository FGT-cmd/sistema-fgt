import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

export function formatDateLong(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    pago: "bg-green-100 text-green-700",
    pendente: "bg-yellow-100 text-yellow-700",
    vencido: "bg-red-100 text-red-700",
    cancelado: "bg-gray-100 text-gray-500",
    ativo: "bg-green-100 text-green-700",
    encerrado: "bg-gray-100 text-gray-500",
    suspenso: "bg-orange-100 text-orange-700",
    lead: "bg-blue-100 text-blue-700",
    active: "bg-green-100 text-green-700",
    inactive: "bg-gray-100 text-gray-500",
    churned: "bg-red-100 text-red-700",
  };
  return colors[status] ?? "bg-gray-100 text-gray-600";
}
