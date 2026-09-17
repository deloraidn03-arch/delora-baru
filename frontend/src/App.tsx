import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Expenses from './pages/Expenses';
import Sales from './pages/Sales';
import Purchases from './pages/Purchases';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Assets from './pages/Assets';
import CashBank from './pages/CashBank';

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8f6]">
        <div className="font-brand text-2xl font-semibold tracking-[0.18em] text-[#8caa9a]">DELORA</div>
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => (
  <AuthProvider>
    <BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/biaya" element={<Expenses />} />
          <Route path="/penjualan" element={<Sales />} />
          <Route path="/pembelian" element={<Purchases />} />
          <Route path="/pesanan" element={<Orders />} />
          <Route path="/customer" element={<Customers />} />
          <Route path="/aset" element={<Assets />} />
          <Route path="/kas" element={<CashBank />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
