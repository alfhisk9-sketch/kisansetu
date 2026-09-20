import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";

// Route-level code splitting: each page is its own chunk instead of one
// large bundle, so the initial load only pulls in Login/Register plus
// shared vendor code — the rest loads on demand as the person navigates.
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const MarketIntelligence = lazy(() => import("./pages/MarketIntelligence"));
const MarketComparison = lazy(() => import("./pages/MarketComparison"));
const Lots = lazy(() => import("./pages/Lots"));
const LotDetail = lazy(() => import("./pages/LotDetail"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const FpoAggregation = lazy(() => import("./pages/FpoAggregation"));
const Storage = lazy(() => import("./pages/Storage"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Grievances = lazy(() => import("./pages/Grievances"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Forecast = lazy(() => import("./pages/Forecast"));
const Profile = lazy(() => import("./pages/Profile"));

function Protected({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

function PageFallback() {
  return <div className="min-h-screen flex items-center justify-center text-sm text-stone-400">Loading…</div>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/market-intelligence" element={<Protected roles={["farmer", "fpo"]}><MarketIntelligence /></Protected>} />
        <Route path="/compare" element={<Protected roles={["farmer", "fpo"]}><MarketComparison /></Protected>} />
        <Route path="/lots" element={<Protected roles={["farmer", "fpo"]}><Lots /></Protected>} />
        <Route path="/lots/:id" element={<Protected roles={["farmer", "fpo", "buyer"]}><LotDetail /></Protected>} />
        <Route path="/marketplace" element={<Protected roles={["farmer", "fpo", "buyer"]}><Marketplace /></Protected>} />
        <Route path="/fpo-aggregation" element={<Protected roles={["fpo"]}><FpoAggregation /></Protected>} />
        <Route path="/storage" element={<Protected roles={["farmer", "fpo"]}><Storage /></Protected>} />
        <Route path="/transactions" element={<Protected roles={["farmer", "fpo", "buyer"]}><Transactions /></Protected>} />
        <Route path="/grievances" element={<Protected roles={["farmer", "fpo", "buyer", "admin"]}><Grievances /></Protected>} />
        <Route path="/assistant" element={<Protected roles={["farmer", "fpo"]}><Assistant /></Protected>} />
        <Route path="/forecast" element={<Protected roles={["farmer", "fpo"]}><Forecast /></Protected>} />
        <Route path="/profile" element={<Protected><Profile /></Protected>} />
        <Route path="/admin" element={<Protected roles={["admin"]}><AdminDashboard /></Protected>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
