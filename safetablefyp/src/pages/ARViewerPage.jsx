import React from "react";
import { useSearchParams } from "react-router-dom";
import GLBModelViewer from "@/components/GLBModelViewer";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const ARViewerPage = () => {
  const [searchParams] = useSearchParams();
  const modelUrl = searchParams.get("model");

  if (!modelUrl) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-6 bg-background">
        <h1 className="text-2xl font-bold mb-2">No Model Specified</h1>
        <p className="text-muted-foreground">Please scan a valid AR QR code from the S.A.F.E Table app.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      <div className="absolute top-0 left-0 w-full p-4 z-10 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-white hover:bg-white/20 rounded-full"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <h1 className="text-white font-bold tracking-widest text-sm uppercase">AR Viewer</h1>
        <div className="w-10"></div> {/* Spacer for centering */}
      </div>
      
      <div className="flex-1 w-full h-full relative">
        {/* We use the same GLBModelViewer which has the <model-viewer> and AR button */}
        <GLBModelViewer 
          modelUrl={modelUrl} 
          height="100%" 
          showControls={true} 
          autoRotate={false} 
        />
      </div>
    </div>
  );
};

export default ARViewerPage;
