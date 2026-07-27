import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Starfield from "@/components/Starfield";
import Dashboard from "@/pages/Dashboard";
import Composer from "@/pages/Composer";
import Drafts from "@/pages/Drafts";
import StyleLibrary from "@/pages/StyleLibrary";
import Newsletter from "@/pages/Newsletter";
import Settings from "@/pages/Settings";
import Finalize from "@/pages/Finalize";

export default function App() {
  return (
    <BrowserRouter>
      <div className="relative min-h-screen flex flex-col light-grain">
        <Starfield />
        <Navbar />
        <main className="relative z-10 flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/new" element={<Composer />} />
            <Route path="/edit/:id" element={<Composer />} />
            <Route path="/drafts" element={<Drafts />} />
            <Route path="/styles" element={<StyleLibrary />} />
            <Route path="/newsletter" element={<Newsletter />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/finalize/:id" element={<Finalize />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

