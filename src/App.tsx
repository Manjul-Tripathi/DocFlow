import GuestAccessPage from "./pages/GuestAccessPage";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { BulkProcessingProvider } from "@/contexts/BulkProcessingContext";
import { ROUTES } from "@/constants/routes";

// Page imports
import Index from "./pages/Index";
import Templates from "./pages/Templates";
import TemplateManagement from "./components/bulk-processing/TemplateManagement";
import Upload from "./pages/Upload";
import Workflows from "./pages/Workflows";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import { Forms } from "./pages/Forms";
import { CreateForm } from "./pages/CreateForm";
import { FormResponses } from "./pages/FormResponses";
import { PublicFormView } from "./pages/PublicFormView";
import { EditForm } from "./pages/EditForm";
import Applications from "./pages/Applications";
import CreateApplication from "./pages/CreateApplication";
import EditApplication from "./pages/EditApplication";
import DocumentManager from "./pages/DocumentManager";
import History from "./pages/History";
import ImagePreviewPage from "./pages/ImagePreviewPage";
import RunApplication from "./pages/RunApplication";
import Settings from "./pages/Settings";
import BulkTest from "./pages/BulkTest";
import EditorWrapper from "@/components/modern-editor/EditorWrapper";
import { SigningPage } from "./pages/SigningPage";

// Configure React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    },
  },
});

/**
 * Route configuration for protected pages
 * Each route includes the page component wrapped with AppLayout
 */
interface RouteConfig {
  path: string;
  element: React.ReactElement;
}

const protectedRoutes: RouteConfig[] = [
  {
    path: ROUTES.HOME,
    element: <AppLayout><Index /></AppLayout>
  },
  {
    path: ROUTES.TEMPLATES,
    element: <AppLayout><Templates /></AppLayout>
  },
  {
    path: ROUTES.TEMPLATE_MANAGEMENT,
    element: <AppLayout><TemplateManagement /></AppLayout>
  },
  {
    path: ROUTES.UPLOAD,
    element: <AppLayout><Upload /></AppLayout>
  },
  {
    path: ROUTES.WORKFLOWS,
    element: <AppLayout><Workflows /></AppLayout>
  },
  {
    path: ROUTES.FORMS,
    element: <AppLayout><Forms /></AppLayout>
  },
  {
    path: ROUTES.FORMS_CREATE,
    element: <AppLayout><CreateForm /></AppLayout>
  },
  {
    path: "/forms/create/:formId",
    element: <AppLayout><CreateForm /></AppLayout>
  },
  {
    path: "/forms/public/:formId/responses",
    element: <AppLayout><FormResponses /></AppLayout>
  },
  {
    path: "/forms/edit/:submissionId",
    element: <AppLayout><EditForm /></AppLayout>
  },
  {
    path: ROUTES.APPLICATIONS,
    element: <AppLayout><Applications /></AppLayout>
  },
  {
    path: "/applications/create",
    element: <AppLayout><CreateApplication /></AppLayout>
  },
  {
    path: "/applications/:applicationId/edit",
    element: <AppLayout><EditApplication /></AppLayout>
  },
  {
    path: "/applications/:identifier/run",
    element: <AppLayout><RunApplication /></AppLayout>
  },
  {
    path: ROUTES.DOCUMENTS,
    element: <AppLayout><DocumentManager /></AppLayout>
  },
  {
    path: ROUTES.HISTORY,
    element: <AppLayout><History /></AppLayout>
  },
  {
    path: ROUTES.IMAGE_PREVIEW,
    element: <AppLayout><ImagePreviewPage /></AppLayout>
  },
  {
    path: ROUTES.SETTINGS,
    element: <AppLayout><Settings /></AppLayout>
  }
];

/**
 * Main App component with provider hierarchy and routing configuration
 */
const App = () => (
  <ErrorBoundary onError={(error, errorInfo) => {
    console.error('Global error caught:', error, errorInfo);
    // TODO: Send to error tracking service
  }}>
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BulkProcessingProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path={ROUTES.AUTH} element={<Auth />} />
                <Route path="/bulk-test" element={<BulkTest />} />
                <Route path="/forms/public/:slug" element={<PublicFormView />} />
                {/* Standalone application runner (no AppLayout wrapper) */}
                {/* Route with form slug - more specific route first */}
                <Route path="/applications/public/:identifier/:formSlug" element={<RunApplication />} />
                {/* Route without form slug - backward compatibility */}
                <Route path="/applications/public/:identifier" element={<RunApplication />} />

                {/* Guest sharing public routes */}
                <Route path="/guest/:token" element={<GuestAccessPage />} />
                <Route path="/s/:token" element={<GuestAccessPage />} />

                {/* Document Editor Route - Protected but standalone layout */}
                <Route path="/editor" element={
                  <ProtectedRoute>
                    <EditorWrapper />
                  </ProtectedRoute>
                } />

                {/* E-Signature public signing route */}
                <Route path="/sign/:token" element={<SigningPage />} />

                {/* Protected routes */}
                {protectedRoutes.map(({ path, element }) => (
                  <Route
                    key={path}
                    path={path}
                    element={<ProtectedRoute>{element}</ProtectedRoute>}
                  />
                ))}

                {/* Fallback route */}
                <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </BulkProcessingProvider>
      </QueryClientProvider>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
