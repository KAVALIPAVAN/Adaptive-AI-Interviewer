import { useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import AuthScreen from "./AuthScreen";
import HistoryDashboard from "./HistoryDashboard";
import AdaptiveInterviewer from "./AdaptiveInterviewer";

function AppRouter() {
  const { user, loading } = useAuth();
  const [screen, setScreen] = useState("home"); // home | interview

  if (loading) return (
    <div style={{
      minHeight: "100vh", background: "#0A0A0F",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'IBM Plex Mono', monospace", color: "#444", fontSize: 12
    }}>
      Loading...
    </div>
  );

  if (!user) return <AuthScreen />;

  if (screen === "interview") return (
    <AdaptiveInterviewer onExit={() => setScreen("home")} />
  );

  // Home = history dashboard with "New Interview" button
  return <HistoryDashboard onBack={() => setScreen("interview")} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
