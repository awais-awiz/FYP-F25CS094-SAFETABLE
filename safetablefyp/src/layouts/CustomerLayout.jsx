import { Outlet } from "react-router-dom";
import GlobalVoiceAssistant from "@/components/GlobalVoiceAssistant";

export default function CustomerLayout() {
  return (
    <div className="min-h-screen bg-background relative pb-28">
      {/* 
        We add padding so that the global orb doesn't completely block 
        content at the very bottom of customer pages. 
      */}
      <Outlet />
      
      {/* The Global AI Connoisseur floats on top of everything */}
      <GlobalVoiceAssistant />
    </div>
  );
}
