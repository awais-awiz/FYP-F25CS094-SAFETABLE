import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Sparkles, AlertTriangle, Loader2, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useCart } from "@/hooks/useCart";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import dishImage from "@/assets/dish-steak.jpg";

const AIPersonalizationPage = () => {
  const { tableNumber } = useCustomerSession();
  const { addItem } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["recommendations", tableNumber],
    queryFn: () => api.chatbot.recommendations(tableNumber),
    enabled: !!tableNumber,
    staleTime: 60000,
  });

  const handleAddToCart = (item) => {
    addItem({ id: item._id, name: item.name, price: item.price });
    toast({ title: "Added to cart", description: `${item.name} added.` });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-2xl border-b border-primary/20 shadow-[0_4px_30px_hsl(190_100%_50%/0.08)]">
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/">
            <Button variant="outline" size="sm" className="bg-background/50 hover:bg-primary/10 hover:text-primary border-primary/20 transition-all shadow-sm rounded-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h1 className="text-xl md:text-2xl font-black text-gradient-primary tracking-wide whitespace-nowrap">
              AI Personalization
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {tableNumber ? (
              <div className="bg-primary/10 px-3 py-1.5 rounded-full text-sm font-bold text-primary shadow-sm border border-primary/20 whitespace-nowrap">
                Table #{tableNumber}
              </div>
            ) : (
              <div className="w-[88px]" />
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12 flex flex-col items-center">
        {!tableNumber ? (
          <Card className="glass-morphism p-8 border-2 border-primary/30 max-w-xl mx-auto w-full text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="font-bold text-2xl mb-2">No Active Table</h3>
            <p className="text-muted-foreground mb-6">
              You need an active table session for the AI to analyze your preferences and provide personalized recommendations.
            </p>
            <Button onClick={() => navigate("/menu")} className="w-full">
              Go to Menu to Start a Session
            </Button>
          </Card>
        ) : (
          <div className="w-full max-w-5xl">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-black mb-2 text-gradient-primary">
                {data?.summary || "Curating Your Menu"}
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Our AI engine has analyzed your palate profile, order history, and current menu availability to handpick these culinary experiences just for you.
              </p>
            </div>

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-20"
                >
                  <div className="relative w-24 h-24 flex items-center justify-center mb-6">
                    <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" style={{ animationDuration: '1.5s' }} />
                    <div className="absolute inset-2 rounded-full border-b-2 border-secondary animate-spin" style={{ animationDuration: '1s', animationDirection: 'reverse' }} />
                    <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                  <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent animate-pulse">
                    Analyzing your taste profile...
                  </h3>
                  <p className="text-sm text-muted-foreground mt-2">Cross-referencing past orders with our current menu.</p>
                </motion.div>
              ) : error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-md mx-auto"
                >
                  <Card className="p-6 text-center border-destructive/50 glass-morphism">
                    <p className="text-destructive font-semibold mb-2">Failed to load recommendations</p>
                    <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
                    <Button onClick={() => refetch()} variant="outline">Retry AI Analysis</Button>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  key="content"
                  className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  {data?.recommendations?.map((item, idx) => (
                    <motion.div
                      key={item._id || idx}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.15, type: "spring", stiffness: 100 }}
                      whileHover={{ y: -5 }}
                    >
                      <Card className="glass-morphism border-2 border-primary/20 hover:border-primary/50 transition-all overflow-hidden group h-full flex flex-col relative shadow-[0_10px_30px_hsl(190_100%_50%/0.05)]">
                        {/* Glow effect */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        <div className="relative h-48 overflow-hidden border-b border-primary/10">
                          <img
                            src={item.image_url || dishImage}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                          <div className="absolute bottom-3 left-4 flex items-center gap-1.5 bg-background/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-primary/20">
                            <Sparkles className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">AI Match</span>
                          </div>
                        </div>
                        
                        <div className="p-6 flex-1 flex flex-col relative z-10">
                          <h3 className="text-2xl font-black mb-2 group-hover:text-primary transition-colors">{item.name}</h3>
                          
                          <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 mb-4 flex-1">
                            <p className="text-sm text-foreground/90 italic leading-relaxed">
                              "{item.reason}"
                            </p>
                          </div>
                          
                          <div className="flex items-center justify-between mt-auto">
                            <span className="text-2xl font-bold text-gradient-primary">
                              Rs. {Math.round(Number(item.price))}
                            </span>
                            <Button
                              variant="glow"
                              size="sm"
                              className="rounded-full px-4 shadow-[0_0_15px_hsl(190_100%_50%/0.3)]"
                              onClick={() => handleAddToCart(item)}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Add
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                  
                  {(!data?.recommendations || data.recommendations.length === 0) && (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                      No personalized recommendations could be generated right now.
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            
            {data?.recommendations?.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-12 text-center"
              >
                <Link to="/menu">
                  <Button variant="outline" size="lg" className="rounded-full px-8 hover:bg-primary/10 hover:text-primary border-primary/20">
                    Explore Full Menu Instead
                  </Button>
                </Link>
              </motion.div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default AIPersonalizationPage;