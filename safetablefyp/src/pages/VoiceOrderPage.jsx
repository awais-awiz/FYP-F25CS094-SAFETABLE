import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Loader2, ArrowLeft, Bot, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { voiceApi, safepayApi, paymentsApi, ordersApi } from "@/lib/api";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ur", name: "Urdu" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "hi", name: "Hindi" },
  { code: "ko", name: "Korean" },
  { code: "it", name: "Italian" },
  { code: "ar", name: "Arabic" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" }
];

const WELCOME_MESSAGES = {
  en: "Welcome to S.A.F.E. Table! Tap the microphone and tell me what you'd like to order.",
  ur: "S.A.F.E. Table میں خوش آمدید! مائیکروفون کو تھپتھپائیں اور بتائیں آپ کیا آرڈر کرنا چاہتے ہیں۔",
  de: "Willkommen bei S.A.F.E. Table! Tippen Sie auf das Mikrofon und sagen Sie mir, was Sie bestellen möchten.",
  es: "¡Bienvenido a S.A.F.E. Table! Toca el micrófono y dime qué te gustaría pedir.",
  fr: "Bienvenue chez S.A.F.E. Table ! Appuyez sur le micro et dites-moi ce que vous souhaitez commander.",
  hi: "S.A.F.E. Table में आपका स्वागत है! माइक्रोफ़ोन पर टैप करें और बताएं कि आप क्या ऑर्डर करना चाहते हैं।",
  ko: "S.A.F.E. Table에 오신 것을 환영합니다! 마이크를 탭하고 주문하고 싶은 것을 말씀해 주세요.",
  it: "Benvenuto in S.A.F.E. Table! Tocca il microfono e dimmi cosa vorresti ordinare.",
  ar: "!مرحباً بك في S.A.F.E. Table! انقر على الميكروفون وأخبرني بما تود طلبه",
  ru: "Добро пожаловать в S.A.F.E. Table! Нажмите на микрофон и скажите, что хотите заказать.",
  zh: "欢迎来到 S.A.F.E. Table！点击麦克风，告诉我您想点什么。",
  ja: "S.A.F.E. Table へようこそ！マイクをタップして、ご注文をお伝えください。",
};

const CANCEL_MESSAGES = {
  en: "Your unpaid order has been cancelled. What else can I help you with?",
  ur: "آپ کا غیر ادا شدہ آرڈر منسوخ کر دیا گیا ہے۔ میں آپ کی اور کیا مدد کر سکتی ہوں؟",
  de: "Ihre unbezahlte Bestellung wurde storniert. Wie kann ich Ihnen sonst helfen?",
  es: "Su pedido no pagado ha sido cancelado. ¿En qué más puedo ayudarle?",
  fr: "Votre commande non payée a été annulée. Comment puis-je vous aider autrement ?",
  hi: "आपका अवैतनिक आदेश रद्द कर दिया गया है। मैं आपकी और क्या मदद कर सकता हूँ?",
  ko: "미결제 주문이 취소되었습니다. 무엇을 더 도와드릴까요?",
  it: "Il tuo ordine non pagato è stato annullato. Come posso aiutarti altrimenti?",
  ar: "تم إلغاء طلبك غير المدفوع. كيف يمكنني مساعدتك في شيء آخر؟",
  ru: "Ваш неоплаченный заказ был отменен. Чем еще я могу вам помочь?",
  zh: "您未支付的订单已取消。还有什么我可以帮您的吗？",
  ja: "未払いの注文はキャンセルされました。他にお手伝いできることはありますか？",
};

const PAYMENT_MESSAGES = {
  en: (amount) => `Your order has been placed. The total is ${amount} rupees. Please scan the QR code to pay.`,
  ur: (amount) => `آپ کا آرڈر دے دیا گیا ہے۔ کل بل ${amount} روپے ہے۔ براہ کرم ادائیگی کے لیے کیو آر کوڈ اسکین کریں۔`,
  de: (amount) => `Ihre Bestellung wurde aufgegeben. Die Gesamtsumme beträgt ${amount} Rupien. Bitte scannen Sie den QR-Code, um zu bezahlen.`,
  es: (amount) => `Su pedido ha sido realizado. El total es de ${amount} rupias. Por favor, escanee el código QR para pagar.`,
  fr: (amount) => `Votre commande a été passée. Le total est de ${amount} roupies. Veuillez scanner le code QR pour payer.`,
  hi: (amount) => `आपका ऑर्डर दे दिया गया है। कुल राशि ${amount} रुपये है। कृपया भुगतान के लिए क्यूआर कोड स्कैन करें।`,
  ko: (amount) => `주문이 완료되었습니다. 총 ${amount} 루피입니다. 결제를 위해 QR 코드를 스캔해 주세요.`,
  it: (amount) => `Il tuo ordine è stato effettuato. Il totale è di ${amount} rupie. Si prega di scansionare il codice QR per pagare.`,
  ar: (amount) => `تم تقديم طلبك. الإجمالي هو ${amount} روبية. يرجى مسح رمز الاستجابة السريعة للدفع.`,
  ru: (amount) => `Ваш заказ размещен. Общая сумма составляет ${amount} рупий. Пожалуйста, отсканируйте QR-код для оплаты.`,
  zh: (amount) => `您的订单已下达。总计 ${amount} 卢比。请扫描二维码付款。`,
  ja: (amount) => `ご注文を承りました。合計は ${amount} ルピーです。支払いのためにQRコードをスキャンしてください。`,
};

/**
 * Speak text using the backend TTS voice ("Microphone Girl").
 * Falls back to browser speechSynthesis only if backend fails.
 */
const speakText = async (text, lang = "en", audioPlayerRef) => {
  const safePronunciationText = text.replace(/S\.A\.F\.E\.?/gi, "SAFE");
  try {
    const res = await voiceApi.tts(safePronunciationText, lang);
    if (res?.success && res.audio_base64 && audioPlayerRef?.current) {
      audioPlayerRef.current.src = `data:${res.content_type || "audio/mpeg"};base64,${res.audio_base64}`;
      await audioPlayerRef.current.play();
      return;
    }
  } catch (err) {
    console.warn("Backend TTS failed, falling back to browser.", err);
  }
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(safePronunciationText);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
};

const VoiceOrderPage = () => {
  const { toast } = useToast();
  const { tableNumber, hasTicket, start, loading } = useCustomerSession();

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState([
    { role: "ai", content: WELCOME_MESSAGES["en"] }
  ]);
  const [orderStatus, setOrderStatus] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  const [checkoutStep, setCheckoutStep] = useState(null);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [paymentQR, setPaymentQR] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  const messagesEndRef = useRef(null);
  const audioPlayerRef = useRef(typeof Audio !== "undefined" ? new Audio() : null);
  const isFirstRender = useRef(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Welcome TTS on first load
  useEffect(() => {
    if (hasTicket && isFirstRender.current) {
      isFirstRender.current = false;
      speakText(WELCOME_MESSAGES["en"], "en", audioPlayerRef);
    }
  }, [hasTicket]);

  // Reset chat + re-welcome when language changes (skip initial render)
  useEffect(() => {
    if (isFirstRender.current) return; // skip the very first mount
    if (!hasTicket) return;

    // Stop any currently playing audio
    window.speechSynthesis?.cancel();
    if (audioPlayerRef.current) { audioPlayerRef.current.pause(); audioPlayerRef.current.src = ""; }

    const welcome = WELCOME_MESSAGES[selectedLanguage] || WELCOME_MESSAGES["en"];
    setMessages([{ role: "ai", content: welcome }]);
    setOrderStatus(null);
    speakText(welcome, selectedLanguage, audioPlayerRef);
  }, [selectedLanguage]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => () => {
    stopRecording();
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = "";
    }
    window.speechSynthesis?.cancel();
  }, []);

  // Poll for payment success
  useEffect(() => {
    let interval;
    if (checkoutStep === "waiting_payment" && currentOrderId) {
      interval = setInterval(async () => {
        try {
          const res = await paymentsApi.byOrder(currentOrderId);
          if (res && res.status === "completed") {
            setCheckoutStep("success");
            setOrderStatus(`Payment Complete for: ${currentOrderId}`);
            speakText("Your payment was successful. The kitchen is now preparing your order.", selectedLanguage, audioPlayerRef);
          }
        } catch (err) {
          // Ignore transient errors
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [checkoutStep, currentOrderId, selectedLanguage]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      // Stop any playing TTS when user starts speaking
      window.speechSynthesis?.cancel();
      if (audioPlayerRef.current) audioPlayerRef.current.pause();

      mediaRecorderRef.current.start(100);
      setIsListening(true);
      setOrderStatus(null);
    } catch {
      toast({ title: "Microphone error", description: "Please allow microphone access.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    setIsListening(false);
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  };

  const processAudioPayload = async () => {
    if (audioChunksRef.current.length === 0) return;
    setIsProcessing(true);
    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

    const historyToPass = messages.length > 1 ? messages.slice(1) : [];

    try {
      const data = await voiceApi.order({
        audio: audioBlob,
        language: selectedLanguage,
        table_number: tableNumber,
        chat_history: JSON.stringify(historyToPass),
      });

      if (data?.success) {
        const userMsg = { role: "user", content: data.transcript || "..." };
        const aiMsg = { role: "ai", content: data.response_text || "...", orderId: data.order_placed ? data.order_id : null };
        setMessages(prev => [...prev, userMsg, aiMsg]);
        
        if (data.order_placed) {
          setOrderStatus(`Order Created: ${data.order_id}`);
          setCurrentOrderId(data.order_id);
          try {
            const intent = await safepayApi.generateQR({
              order_id: data.order_id,
              table_number: tableNumber,
            });
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(intent.checkout_url)}`;
            setPaymentQR(qrUrl);
            setPaymentAmount(intent.amount || 0);
            setCheckoutStep("waiting_payment");
            
            // Speak payment instructions using translated message
            const getPaymentMsg = PAYMENT_MESSAGES[selectedLanguage] || PAYMENT_MESSAGES["en"];
            const paymentMsg = getPaymentMsg(intent.amount || 0);
            speakText(paymentMsg, selectedLanguage, audioPlayerRef);
          } catch (err) {
            toast({ title: "Payment Init failed", description: err.message, variant: "destructive" });
          }
        }

        if (data.audio_base64 && audioPlayerRef.current) {
          audioPlayerRef.current.src = `data:${data.audio_content_type || "audio/mp3"};base64,${data.audio_base64}`;
          audioPlayerRef.current.play().catch(() => {});
          audioPlayerRef.current.onended = () => { audioPlayerRef.current.src = ""; };
        } else if (data.use_browser_tts && data.response_text) {
          speakText(data.response_text, selectedLanguage, audioPlayerRef);
        }
      } else if (data?.response_text) {
        setMessages(prev => [...prev, { role: "ai", content: data.response_text }]);
        speakText(data.response_text, selectedLanguage, audioPlayerRef);
      }
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes("no audio")) {
        setMessages(prev => [...prev, { role: "ai", content: "I didn't quite catch that. Please tap the mic and try again." }]);
        speakText("I didn't quite catch that. Please tap the mic and try again.", selectedLanguage, audioPlayerRef);
      } else {
        toast({ title: "Voice order failed", description: err.message, variant: "destructive" });
        setMessages(prev => [...prev, { role: "ai", content: "Sorry, something went wrong with the connection." }]);
      }
    } finally {
      setIsProcessing(false);
      audioChunksRef.current = [];
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopRecording();
      processAudioPayload();
    } else {
      startRecording();
    }
  };

  const handleCancelOrder = async () => {
    if (currentOrderId) {
      try {
        await ordersApi.cancelUnpaid(currentOrderId);
      } catch (err) {
        console.warn("Failed to cancel unpaid order", err);
      }
    }
    setCheckoutStep(null);
    setOrderStatus("Order Cancelled");
    const msg = CANCEL_MESSAGES[selectedLanguage] || CANCEL_MESSAGES["en"];
    setMessages(prev => [...prev, { role: "ai", content: msg }]);
    speakText(msg, selectedLanguage, audioPlayerRef);
  };

  // ── Session Required Screen ──────────────────────────────────────────────
  if (!hasTicket) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="glass-morphism p-8 max-w-md w-full shadow-2xl rounded-3xl border-primary/20">
          <div className="flex flex-col items-center text-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-2 glow-blue">
              <Mic className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-2xl text-foreground mb-2 tracking-tight">Voice Assistant</h2>
              <p className="text-sm text-muted-foreground">Please start a session to enable voice ordering for your table.</p>
            </div>
          </div>
          <Button onClick={async () => {
            const result = await start("en");
            if (!result?.success) {
              toast({
                title: "Unable to start session",
                description: result?.message || "Please try again.",
                variant: "destructive",
              });
            }
          }} disabled={loading} className="w-full h-14 rounded-2xl text-lg font-medium shadow-lg hover:shadow-primary/50 transition-all bg-primary text-primary-foreground">
            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
            {loading ? "Starting Session…" : "Start Automated Session"}
          </Button>
        </Card>
      </div>
    );
  }

  // ── Main Voice Assistant UI ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative">

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
            <Mic className="w-5 h-5 text-primary" />
            <h1 className="text-xl md:text-2xl font-black text-gradient-primary tracking-wide whitespace-nowrap">
              Voice Assistant
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 px-3 py-1.5 rounded-full text-sm font-bold text-primary shadow-sm border border-primary/20">
              Table #{tableNumber}
            </div>
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage} disabled={isProcessing || isListening}>
              <SelectTrigger className="w-[120px] bg-card/60 border-primary/20 rounded-full h-9 text-sm focus:ring-1 focus:ring-primary">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border text-foreground">
                {LANGUAGES.map(lang => (
                  <SelectItem key={lang.code} value={lang.code} className="focus:bg-primary/20">{lang.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* Main Content — chat + orb */}
      <main className="flex-1 container mx-auto px-4 flex flex-col max-w-3xl relative">
        
        {/* Chat Messages — scrollable area that stops ABOVE the orb zone */}
        <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-4" style={{ paddingBottom: '220px' }}>
          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 15, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground border-primary/50 shadow-[0_0_12px_hsl(190_100%_50%/0.4)]"
                      : "bg-secondary/20 text-secondary border-secondary/30 shadow-[0_0_12px_hsl(280_100%_50%/0.2)]"
                  }`}>
                    {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                  <div className={`p-4 rounded-2xl border ${
                    msg.role === "user"
                      ? "bg-primary/10 border-primary/20 rounded-tr-sm"
                      : "glass-morphism rounded-tl-sm"
                  }`}>
                    <p className="text-[15px] leading-relaxed text-foreground">{msg.content}</p>
                    {msg.orderId && (
                      <div className="mt-3 py-2 px-3 bg-green-500/10 rounded-lg flex items-center gap-2 border border-green-500/20">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_hsl(142_76%_36%/0.6)]" />
                        <p className="text-green-400 text-xs font-bold uppercase tracking-wider">Order: {msg.orderId}</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Processing indicator */}
          {isProcessing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full justify-start">
              <div className="flex gap-3 max-w-[85%] flex-row">
                <div className="w-9 h-9 rounded-full bg-secondary/20 text-secondary border border-secondary/30 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="p-4 rounded-2xl glass-morphism rounded-tl-sm flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Fixed Bottom Orb Area — sits in a dedicated zone that chat cannot overlap */}
        <div className="fixed bottom-0 left-0 w-full z-40 pointer-events-none">
          <div className="bg-gradient-to-t from-background via-background/95 to-transparent pt-10 pb-10 flex flex-col items-center gap-4 pointer-events-auto">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={toggleListening}
              disabled={isProcessing}
              className={`relative flex items-center justify-center rounded-full transition-all duration-500 group ${
                isListening
                  ? "w-24 h-24 bg-gradient-to-br from-primary via-secondary to-accent shadow-[0_0_50px_hsl(190_100%_50%/0.5)]"
                  : isProcessing
                  ? "w-20 h-20 bg-card border-2 border-border shadow-lg"
                  : "w-20 h-20 bg-primary/15 border-2 border-primary/30 shadow-[0_0_30px_hsl(190_100%_50%/0.15)] hover:bg-primary/25 hover:border-primary/50"
              }`}
            >
              {isListening && (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping opacity-50" style={{ animationDuration: '1.2s' }} />
                  <div className="absolute inset-0 rounded-full border border-primary/20 animate-pulse" />
                </>
              )}

              {isProcessing ? (
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              ) : isListening ? (
                <div className="flex gap-1 items-end h-7">
                  <motion.div animate={{ height: ["40%", "100%", "40%"] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-1.5 bg-primary-foreground rounded-full" />
                  <motion.div animate={{ height: ["20%", "80%", "20%"] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1.5 bg-primary-foreground rounded-full" />
                  <motion.div animate={{ height: ["60%", "100%", "60%"] }} transition={{ repeat: Infinity, duration: 0.7 }} className="w-1.5 bg-primary-foreground rounded-full" />
                  <motion.div animate={{ height: ["30%", "70%", "30%"] }} transition={{ repeat: Infinity, duration: 0.9 }} className="w-1.5 bg-primary-foreground rounded-full" />
                </div>
              ) : (
                <Mic className="w-7 h-7 text-primary group-hover:text-primary drop-shadow-lg transition-transform group-hover:scale-110" />
              )}
            </motion.button>
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              {isListening ? "Listening…" : isProcessing ? "Thinking…" : "Tap to speak"}
            </p>
          </div>
        </div>
      </main>

      {/* Payment QR Dialog */}
      <Dialog open={checkoutStep === "waiting_payment"} onOpenChange={(open) => !open && setCheckoutStep(null)}>
        <DialogContent className="sm:max-w-md text-center glass-morphism border-primary/20 text-foreground rounded-2xl shadow-[0_0_60px_hsl(190_100%_50%/0.1)]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tight mb-2 text-gradient-primary">
              Complete Payment
            </DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center justify-center">
            {paymentQR ? (
              <div className="bg-white p-5 rounded-2xl shadow-xl mb-6 border-2 border-primary/10">
                <img src={paymentQR} alt="SafePay QR" className="w-48 h-48" />
              </div>
            ) : (
              <div className="flex flex-col items-center py-10">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground font-medium">Generating secure checkout…</p>
              </div>
            )}

            {paymentAmount > 0 && (
              <div className="mb-6 flex flex-col items-center">
                <p className="text-sm text-muted-foreground mb-1 uppercase tracking-widest font-bold">Total Amount</p>
                <h3 className="text-4xl font-black text-white">Rs {paymentAmount}</h3>
              </div>
            )}

            <div className="flex items-center gap-2 mb-3 bg-primary/10 py-2 px-4 rounded-full border border-primary/20">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse glow-blue" />
              <p className="text-sm font-semibold text-primary tracking-wide">Awaiting scan…</p>
            </div>
            <p className="text-xs text-muted-foreground">Use any supported mobile payment app.</p>
          </div>
          <div className="flex gap-3 w-full">
            <Button variant="outline" className="flex-1 h-12 rounded-xl border-destructive/30 hover:bg-destructive hover:text-destructive-foreground text-foreground font-semibold transition-all" onClick={handleCancelOrder}>
              Cancel Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={checkoutStep === "success"} onOpenChange={(open) => !open && setCheckoutStep(null)}>
        <DialogContent className="sm:max-w-md text-center glass-morphism border-green-500/20 text-foreground rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-green-400 flex items-center justify-center gap-2">
              Payment Successful!
            </DialogTitle>
          </DialogHeader>
          <div className="py-8 flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-6 shadow-[0_0_30px_hsl(142_76%_36%/0.2)] border border-green-500/20">
              <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold mb-2">Order Sent to Kitchen</p>
            <p className="text-sm text-muted-foreground px-4">Your voice order is now being prepared. We'll bring it right to your table!</p>
          </div>
          <div className="flex gap-3 w-full">
            <Button className="flex-1 h-12 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold" onClick={() => setCheckoutStep(null)}>
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VoiceOrderPage;