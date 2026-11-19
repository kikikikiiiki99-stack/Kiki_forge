import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import PaymentReturn from "@/pages/PaymentReturn";
import { Show, SignIn, SignUp } from "@clerk/react";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
const Terminal = lazy(() => import("@/pages/Terminal"));
const Landing = lazy(() => import("@/pages/Landing"));
import { Background } from "@/components/sf/Background";

const AuthPage = ({ children }) => (
  <div className="min-h-screen relative flex items-center justify-center px-4 py-10">
    <Background tier={5} />
    <div className="relative z-10">{children}</div>
  </div>
);

const Home = () => (
  <>
    <Show when="signed-in"><Suspense fallback={<div className="min-h-screen bg-[#080B11]" />}><Terminal /></Suspense></Show>
    <Show when="signed-out"><Suspense fallback={<div className="min-h-screen bg-[#080B11]" />}><Landing /></Suspense></Show>
  </>
);

function App() {
  return (
    <ClerkAuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sign-in/*" element={<AuthPage><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp /></AuthPage>} />
          <Route path="/sign-up/*" element={<AuthPage><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" /></AuthPage>} />
          <Route path="/payment/success" element={<PaymentReturn ok />} />
          <Route path="/payment/cancel" element={<PaymentReturn ok={false} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    </ClerkAuthProvider>
  );
}

export default App;
