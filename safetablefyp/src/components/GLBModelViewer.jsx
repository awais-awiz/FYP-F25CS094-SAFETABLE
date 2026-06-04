import React from "react";

const GLBModelViewer = ({
  modelUrl,
  className = "",
  height = "400px",
  autoRotate = true,
  scale = 1,
  showControls = true,
}) => {
  if (!modelUrl) return null;

  return (
    <div className={`relative w-full rounded-xl overflow-hidden ${className}`} style={{ height }}>
      {showControls && (
        <div className="absolute top-3 left-3 z-10 bg-background/70 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs text-muted-foreground border border-border/50">
          🖱️ Drag to rotate • Scroll to zoom
        </div>
      )}

      {/* The magic 'ar' flag triggers native iOS/Android AR! */}
      <model-viewer
        src={modelUrl}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        auto-rotate={autoRotate ? "true" : undefined}
        shadow-intensity="1"
        environment-image="neutral"
        exposure="1.2"
        style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
        alt="3D model of food item"
      >
        <div slot="poster" className="absolute inset-0 flex items-center justify-center bg-black/10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Loading 3D model…</p>
          </div>
        </div>

        {/* Custom AR Button */}
        <button
          slot="ar-button"
          className="absolute bottom-6 right-6 bg-primary text-white px-4 py-2 rounded-full font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2 z-50 border border-white/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0"></path>
            <path d="m22 12-10 10"></path>
            <path d="m12 2-10 10"></path>
          </svg>
          View in AR
        </button>
      </model-viewer>

      {/* Bottom gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
    </div>
  );
};

export default GLBModelViewer;
