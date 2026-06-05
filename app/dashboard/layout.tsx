// Dashboard route layout - pass-through to let DashboardLayout handle everything
// This prevents Next.js from adding any middleware-level redirects
export default function DashboardRouteLayout({ children }: { children: React.ReactNode }) {
  return children
}
