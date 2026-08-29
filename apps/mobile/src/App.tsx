import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./state/auth-context.js";
import { SyncProvider } from "./state/sync-context.js";
import { SmsProvider } from "./state/sms-context.js";
import { OcrProvider } from "./state/ocr-context.js";
import { SmsCaptureProvider } from "./state/capture-context.js";
import { RequireAuth, GuestOnly } from "./components/auth/Guards.js";
import { AppShell } from "./components/layout/AppShell.js";
import { LoginPage } from "./pages/auth/LoginPage.js";
import { RegisterPage } from "./pages/auth/RegisterPage.js";
import { HomePage } from "./pages/HomePage.js";
import { ReviewsPage } from "./pages/ReviewsPage.js";
import { ReceiptsPage } from "./pages/ReceiptsPage.js";

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SyncProvider>
        <SmsProvider>
          <OcrProvider>
            <SmsCaptureProvider>{children}</SmsCaptureProvider>
          </OcrProvider>
        </SmsProvider>
      </SyncProvider>
    </AuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: (
      <Providers>
        <GuestOnly>
          <Outlet />
        </GuestOnly>
      </Providers>
    ),
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
    ],
  },
  {
    element: (
      <Providers>
        <RequireAuth>
          <AppShell />
        </RequireAuth>
      </Providers>
    ),
    children: [
      { path: "/", element: <Navigate to="/home" replace /> },
      { path: "/home", element: <HomePage /> },
      { path: "/reviews", element: <ReviewsPage /> },
      { path: "/receipts", element: <ReceiptsPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
