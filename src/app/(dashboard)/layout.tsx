import Sidebar from "@/components/layout/Sidebar";
export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <div className="flex h-screen overflow-hidden" style={{
    background: "#f8fafc"
  }}>
    <Sidebar />
    <main className="min-w-0 flex-1 overflow-y-auto">
      {children}
    </main>
  </div>;
}
