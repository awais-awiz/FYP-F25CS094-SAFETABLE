import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mic, Loader2, Bot, User, MessageSquare, Sparkles, Plus, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { voiceApi, safepayApi, paymentsApi, ordersApi, menuApi } from "@/lib/api";
import { useCustomerSession } from "@/hooks/useCustomerSession";
import { useCart } from "@/hooks/useCart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import GLBModelViewer from "@/components/GLBModelViewer";
import { useOrders } from "@/hooks/useOrders";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import dishImage from "@/assets/dish-steak.jpg";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
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

const REMINDER_MESSAGES = {
  en: "Please remember to scan the QR code to complete your payment.",
  ur: "براہ کرم اپنی ادائیگی مکمل کرنے کے لیے کیو آر کوڈ اسکین کرنا یاد رکھیں۔",
  de: "Bitte denken Sie daran, den QR-Code zu scannen, um Ihre Zahlung abzuschließen.",
  es: "Por favor, recuerde escanear el código QR para completar su pago.",
  fr: "N'oubliez pas de scanner le code QR pour finaliser votre paiement.",
  hi: "कृपया अपना भुगतान पूरा करने के लिए क्यूआर कोड स्कैन करना याद रखें।",
  ko: "결제를 완료하려면 QR 코드를 스캔해 주세요.",
  it: "Ricorda di scansionare il codice QR per completare il pagamento.",
  ar: "يرجى تذكر مسح رمز الاستجابة السريعة لإكمال دفعتك.",
  ru: "Пожалуйста, не забудьте отсканировать QR-код для завершения оплаты.",
  zh: "请记得扫描二维码完成支付。",
  ja: "支払いを完了するためにQRコードをスキャンすることを忘れないでください。",
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

const speakText = async (text, lang = "en", audioPlayerRef, onEnd = null) => {
  const safePronunciationText = text.replace(/S\.A\.F\.E\.?/gi, "SAFE");
  try {
    const res = await voiceApi.tts(safePronunciationText, lang);
    if (res?.success && res.audio_base64 && audioPlayerRef?.current) {
      audioPlayerRef.current.src = `data:${res.content_type || "audio/mpeg"};base64,${res.audio_base64}`;
      audioPlayerRef.current.onended = () => {
        audioPlayerRef.current.src = "";
        if (onEnd) onEnd();
      };
      await audioPlayerRef.current.play();
      return;
    }
  } catch (err) {
    console.warn("Backend TTS failed, falling back to browser.", err);
  }
  if (!window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(safePronunciationText);
  utterance.lang = lang;
  utterance.onend = () => { if (onEnd) onEnd(); };
  window.speechSynthesis.speak(utterance);
};

const GlobalVoiceAssistant = () => {
  const { toast } = useToast();
  const { items, addItem, removeItem, clearCart, updateQuantity } = useCart();
  const { addOrder } = useOrders();
  const { tableNumber, hasTicket, sessionJustStarted } = useCustomerSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [isChatOpen, setIsChatOpen] = useState(false);
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
  const [activeModels, setActiveModels] = useState([]);
  const [activeModelIndex, setActiveModelIndex] = useState(0);

  // Fetch menu to resolve model IDs
  const { data: menuData } = useQuery({
    queryKey: ["menu"],
    queryFn: () => menuApi.list(),
  });
  const menuItems = menuData?.items || [];

  const messagesEndRef = useRef(null);
  const audioPlayerRef = useRef(typeof Audio !== "undefined" ? new Audio() : null);
  const prevLanguageRef = useRef(selectedLanguage);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isChatOpen]);

  // Situation 1: Welcome TTS when customer starts session
  useEffect(() => {
    if (hasTicket && sessionJustStarted) {
      useCustomerSession.setState({ sessionJustStarted: false });
      const welcome = WELCOME_MESSAGES[selectedLanguage] || WELCOME_MESSAGES["en"];
      setMessages([{ role: "ai", content: welcome }]);
      speakText(welcome, selectedLanguage, audioPlayerRef, () => startRecording());
    }
  }, [hasTicket, sessionJustStarted, selectedLanguage]);

  // Situation 2: Welcome TTS when customer changes language
  useEffect(() => {
    if (!hasTicket) return;
    if (prevLanguageRef.current === selectedLanguage) return;
    
    prevLanguageRef.current = selectedLanguage;

    window.speechSynthesis?.cancel();
    if (audioPlayerRef.current) { audioPlayerRef.current.pause(); audioPlayerRef.current.src = ""; }

    const welcome = WELCOME_MESSAGES[selectedLanguage] || WELCOME_MESSAGES["en"];
    setMessages([{ role: "ai", content: welcome }]);
    setOrderStatus(null);
    speakText(welcome, selectedLanguage, audioPlayerRef, () => startRecording());
  }, [selectedLanguage, hasTicket]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const vadFrameRef = useRef(null);
  const checkInTimeoutRef = useRef(null);

  const messagesRef = useRef(messages);
  const selectedLanguageRef = useRef(selectedLanguage);
  const manualStopRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage;
  }, [selectedLanguage]);

  useEffect(() => () => {
    if (vadFrameRef.current) cancelAnimationFrame(vadFrameRef.current);
    if (checkInTimeoutRef.current) clearTimeout(checkInTimeoutRef.current);
    stopRecording();
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = "";
    }
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    let pollingInterval;
    let reminderInterval;
    let timeout;

    if (checkoutStep === "waiting_payment" && currentOrderId) {
      // 1. Poll for payment status
      pollingInterval = setInterval(async () => {
        try {
          const res = await paymentsApi.byOrder(currentOrderId);
          if (res && res.status === "completed") {
            setCheckoutStep("success");
            setOrderStatus(`Payment Complete for: ${currentOrderId}`);
            setIsChatOpen(true);
            speakText("Your payment was successful. The kitchen is now preparing your order.", selectedLanguage, audioPlayerRef);
          }
        } catch (err) { }
      }, 3000);

      // 2. Remind user every 60 seconds
      reminderInterval = setInterval(() => {
        const msg = REMINDER_MESSAGES[selectedLanguage] || REMINDER_MESSAGES["en"];
        speakText(msg, selectedLanguage, audioPlayerRef);
      }, 60000);

      // 3. Auto-cancel after 5 minutes (300,000 ms)
      timeout = setTimeout(async () => {
        try {
          // Cancel order
          await ordersApi.updateStatus(currentOrderId, "cancelled");
          
          // Speak cancellation message
          const msg = CANCEL_MESSAGES[selectedLanguage] || CANCEL_MESSAGES["en"];
          speakText(msg, selectedLanguage, audioPlayerRef);
          
          // End session & reset UI
          const { tableNumber } = useCustomerSession.getState();
          if (tableNumber) {
            await tablesApi.endSession(tableNumber).catch(console.error);
          }
          useCustomerSession.getState().end();
          setCheckoutStep(null);
          setMessages([]);
          setOrderStatus("Session Ended due to payment timeout");
        } catch (err) {
          console.error("Failed to auto-cancel order:", err);
        }
      }, 300000);
    }

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
      if (reminderInterval) clearInterval(reminderInterval);
      if (timeout) clearTimeout(timeout);
    };
  }, [checkoutStep, currentOrderId, selectedLanguage]);

  const startRecording = async () => {
    if (checkInTimeoutRef.current) {
      clearTimeout(checkInTimeoutRef.current);
      checkInTimeoutRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      window.speechSynthesis?.cancel();
      if (audioPlayerRef.current) audioPlayerRef.current.pause();

      mediaRecorderRef.current.start(100);
      setIsListening(true);
      manualStopRef.current = false;
      setOrderStatus(null);
      // Auto-open chat sheet when they start talking
      if (!isChatOpen) setIsChatOpen(true);

      // Setup Voice Activity Detection (VAD)
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let hasSpoken = false;
      let silenceStart = null;

      const checkSilence = () => {
        if (!streamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const averageVolume = sum / dataArray.length;

        if (averageVolume > 25) {
          hasSpoken = true;
          silenceStart = null;
        } else if (hasSpoken) {
          if (!silenceStart) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > 1500) {
            stopRecording();
            setTimeout(processAudioPayload, 50); // slight delay to ensure chunk flush
            return;
          }
        }
        vadFrameRef.current = requestAnimationFrame(checkSilence);
      };
      checkSilence();

    } catch (err) {
      console.error("Mic error", err);
      toast({ title: "Microphone error", description: "Please allow microphone access.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    setIsListening(false);
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  };

  const processAudioPayload = async () => {
    if (audioChunksRef.current.length === 0) return;
    setIsProcessing(true);
    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

    const currentMessages = messagesRef.current;
    const currentLang = selectedLanguageRef.current;
    const historyToPass = currentMessages.length > 1 ? currentMessages.slice(1) : [];

    try {
      const data = await voiceApi.order({
        audio: audioBlob,
        language: currentLang,
        table_number: tableNumber,
        chat_history: JSON.stringify(historyToPass),
      });

      if (data?.success) {
        const commands = data.client_commands || {};
        const payload = data.payload || {};

        let recsToDisplay = [];
        if (commands.ui_action === "SHOW_RECOMMENDATIONS" && payload.recommendations) {
          recsToDisplay = payload.recommendations.map(r => {
            const item = menuItems.find(m => m._id === r.menu_id);
            return item ? { ...item, reason: r.reason } : null;
          }).filter(Boolean);
        }

        const userMsg = { role: "user", content: data.transcript || "..." };
        const aiMsg = { 
          role: "ai", 
          content: data.response_text || "...", 
          orderId: data.order_placed ? data.order_id : null,
          recommendations: recsToDisplay.length > 0 ? recsToDisplay : null
        };
        setMessages(prev => [...prev, userMsg, aiMsg]);

        if (commands.route_to && commands.route_to !== "STAY") {
          setTimeout(() => {
            navigate(commands.route_to);
          }, 2500);
        }

        if (commands.ui_action === "SHOW_3D_MODEL" && payload.model_ids) {
          const ids = payload.model_ids;
          const modelsToDisplay = menuItems.filter(item => ids.includes(item._id) && item.model_3d_url);
          if (modelsToDisplay.length > 0) {
            setActiveModels(modelsToDisplay);
            setActiveModelIndex(0);
          }
        } else if (commands.ui_action === "NONE" || commands.ui_action === "HIDE_3D_MODEL") {
          setActiveModels([]);
        }

        if (commands.api_trigger === "CALL_SERVICE") {
          const serviceType = payload.service_type || "waiter";
          fetch(`${API_BASE}/api/service-requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table_number: String(tableNumber || "0"), request_type: serviceType }),
          }).then(res => {
            if (res.ok) {
              toast({ title: "Staff Notified", description: `Your request for ${serviceType} has been instantly sent to the staff.` });
            }
          }).catch(err => console.error("Voice service request failed", err));
        }

        if (commands.api_trigger === "CALL_STAFF") {
          // Legacy fallback just in case
          toast({ title: "Staff Notified", description: "A waiter is on their way to your table." });
        }

        if (commands.api_trigger === "ADD_TO_CART" && payload.cart_items) {
          payload.cart_items.forEach(item => {
            const match = menuItems.find(m => m._id === item.menu_id);
            if (match) {
              for (let i = 0; i < (item.quantity || 1); i++) {
                addItem({ id: match._id, name: match.name, price: match.price });
              }
            }
          });
          toast({ title: "Cart Updated", description: "Items added to your cart via voice." });
        }

        if (data.order_placed || commands.api_trigger === "SUBMIT_ORDER") {
          let orderIdToPay = data.order_id;
          
          // If the AI triggered SUBMIT_ORDER but order hasn't been created yet, use the frontend cart
          if (!orderIdToPay && items.length > 0) {
            try {
              const order = await addOrder(items);
              orderIdToPay = order.orderId || order.order_id;
            } catch (err) {
              toast({ title: "Order failed", description: err.message, variant: "destructive" });
            }
          }

          if (orderIdToPay) {
            setOrderStatus(`Order Created: ${orderIdToPay}`);
            setCurrentOrderId(orderIdToPay);
            try {
              const intent = await safepayApi.generateQR({
                order_id: orderIdToPay,
                table_number: tableNumber,
              });
              const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(intent.checkout_url)}`;
              setPaymentQR(qrUrl);
              setPaymentAmount(intent.amount || 0);
              setCheckoutStep("waiting_payment");
              setIsChatOpen(false); // Hide chat to show payment dialog clearly
            } catch (err) {
              toast({ title: "Payment Init failed", description: err.message, variant: "destructive" });
            }
          } else {
            toast({ title: "Empty Cart", description: "You have no items in your cart to place an order.", variant: "destructive" });
          }
        }

        const handleAudioEnd = () => {
          if (!data.order_placed && commands?.api_trigger !== "SUBMIT_ORDER" && commands?.api_trigger !== "WAIT_AND_CHECK_IN" && !manualStopRef.current) {
            startRecording();
          }
        };

        if (commands?.api_trigger === "WAIT_AND_CHECK_IN") {
          if (checkInTimeoutRef.current) clearTimeout(checkInTimeoutRef.current);
          checkInTimeoutRef.current = setTimeout(() => {
            const checkInMsg = {
              en: "Have you decided what you'd like to order, or do you need more time?",
              ur: "کیا آپ نے فیصلہ کر لیا ہے، یا آپ کو مزید وقت چاہیے؟",
            };
            const text = checkInMsg[currentLang] || checkInMsg["en"];
            setMessages(prev => [...prev, { role: "ai", content: text }]);
            speakText(text, currentLang, audioPlayerRef, () => {
              startRecording();
            });
          }, 60000);
        }

        if (data.audio_base64 && audioPlayerRef.current) {
          audioPlayerRef.current.src = `data:${data.audio_content_type || "audio/mp3"};base64,${data.audio_base64}`;
          audioPlayerRef.current.onended = () => { 
            audioPlayerRef.current.src = ""; 
            handleAudioEnd();
          };
          audioPlayerRef.current.play().catch(() => {});
        } else if (data.use_browser_tts && data.response_text) {
          speakText(data.response_text, currentLang, audioPlayerRef, handleAudioEnd);
        } else {
          handleAudioEnd();
        }
      } else if (data?.response_text) {
        setMessages(prev => [...prev, { role: "ai", content: data.response_text }]);
        speakText(data.response_text, currentLang, audioPlayerRef, () => {
          if (!manualStopRef.current) startRecording();
        });
      }
    } catch (err) {
      console.error("STT/Voice Backend Error:", err);
      if (err.message && err.message.includes("STT key configured")) {
        toast({ title: "Missing API Key", description: "The backend is missing GROQ_API_KEY. Please add it to your environment variables.", variant: "destructive" });
        setMessages(prev => [...prev, { role: "ai", content: "System configuration error. Missing API key." }]);
      } else if (err.message && err.message.toLowerCase().includes("no audio")) {
        setMessages(prev => [...prev, { role: "ai", content: "I didn't quite catch that. Please tap the mic and try again." }]);
        speakText("I didn't quite catch that. Please tap the mic and try again.", currentLang, audioPlayerRef);
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
      manualStopRef.current = true;
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
      } catch (err) { }
    }
    setCheckoutStep(null);
    setOrderStatus("Order Cancelled");
    const msg = CANCEL_MESSAGES[selectedLanguage] || CANCEL_MESSAGES["en"];
    setMessages(prev => [...prev, { role: "ai", content: msg }]);
    speakText(msg, selectedLanguage, audioPlayerRef);
    setIsChatOpen(true);
  };

  const hiddenPaths = ["/login", "/signup", "/admin", "/manager", "/server", "/cleaner", "/kitchen"];
  if (!hasTicket || hiddenPaths.some(p => location.pathname.startsWith(p))) return null;

  return (
    <>
      {/* Global Bottom Orb (Siri-style Floating Dock) */}
      {checkoutStep !== "waiting_payment" && (
        <div className="fixed bottom-6 left-0 w-full z-40 pointer-events-none flex justify-center">
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          className="pointer-events-auto relative flex items-center justify-between px-6 py-3 gap-6 bg-background/60 backdrop-blur-3xl border border-primary/20 rounded-full shadow-[0_8px_32px_hsl(190_100%_50%/0.15)]"
        >
          {/* Table ID */}
          <div className="flex flex-col items-center justify-center min-w-[60px]">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Table</span>
            <span className="text-sm font-black text-gradient-primary">#{tableNumber}</span>
          </div>
          
          {/* Main Mic Button */}
          <div className="flex flex-col items-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleListening}
              disabled={isProcessing}
              className={`relative flex items-center justify-center rounded-full transition-all duration-700 group overflow-hidden ${
                isListening
                  ? "w-16 h-16 bg-gradient-to-r from-primary via-[#a855f7] to-primary shadow-[0_0_40px_hsl(280_100%_50%/0.6)] animate-pulse"
                  : isProcessing
                  ? "w-14 h-14 bg-card border border-primary/30 shadow-[0_0_20px_hsl(190_100%_50%/0.2)]"
                  : "w-14 h-14 bg-primary/10 border border-primary/30 shadow-[0_0_20px_hsl(190_100%_50%/0.1)] hover:bg-primary/20 hover:border-primary/50"
              }`}
            >
              {/* Siri-style magical glow behind icon */}
              {isListening && (
                <div className="absolute inset-0 bg-white/20 rounded-full mix-blend-overlay animate-pulse" />
              )}

              {isProcessing ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : isListening ? (
                <div className="flex gap-1 items-center h-5">
                  <motion.div animate={{ height: ["40%", "100%", "40%"] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1 bg-white rounded-full" />
                  <motion.div animate={{ height: ["20%", "80%", "20%"] }} transition={{ repeat: Infinity, duration: 0.4 }} className="w-1 bg-white rounded-full" />
                  <motion.div animate={{ height: ["60%", "100%", "60%"] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-1 bg-white rounded-full" />
                  <motion.div animate={{ height: ["30%", "70%", "30%"] }} transition={{ repeat: Infinity, duration: 0.7 }} className="w-1 bg-white rounded-full" />
                </div>
              ) : (
                <Mic className="w-5 h-5 text-primary group-hover:text-primary transition-transform group-hover:scale-110" />
              )}
            </motion.button>
          </div>

          {/* Chat Toggle */}
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`rounded-full flex items-center justify-center transition-all duration-300 min-w-[60px] h-[60px] ${isChatOpen ? 'bg-primary/20 text-primary shadow-[0_0_15px_hsl(190_100%_50%/0.3)]' : 'hover:bg-white/10 hover:text-white text-muted-foreground border border-transparent hover:border-white/10'}`}
            onClick={() => setIsChatOpen(!isChatOpen)}
          >
            <MessageSquare className="w-5 h-5" />
          </motion.button>
        </motion.div>
      </div>
      )}

      {/* Floating Chat Panel (Non-blocking, modern glass design) */}
      <AnimatePresence>
        {isChatOpen && checkoutStep !== "waiting_payment" && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-24 right-4 sm:right-8 w-[calc(100vw-2rem)] sm:w-[420px] max-h-[70vh] bg-background/40 backdrop-blur-3xl border border-primary/10 rounded-3xl shadow-[0_20px_50px_hsl(280_100%_50%/0.15)] z-50 flex flex-col overflow-hidden pointer-events-auto"
          >
            {/* Header */}
            <div className="flex flex-row items-center justify-between p-4 border-b border-white/5 bg-black/20 relative z-10 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-[#a855f7] flex items-center justify-center shadow-[0_0_15px_hsl(280_100%_50%/0.5)]">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-black bg-gradient-to-r from-primary to-[#a855f7] bg-clip-text text-transparent tracking-wide">
                  AI Connoisseur
                </h3>
              </div>
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage} disabled={isProcessing || isListening}>
                <SelectTrigger className="w-[110px] bg-black/40 border-primary/30 rounded-full h-8 text-xs text-white focus:ring-1 focus:ring-primary">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border text-foreground z-[60]">
                  {LANGUAGES.map(lang => (
                    <SelectItem key={lang.code} value={lang.code} className="focus:bg-primary/20 text-xs">{lang.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 relative custom-scrollbar">
              
              {/* Chat Messages */}
              <AnimatePresence>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={`flex w-full flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div className={`flex gap-3 max-w-[90%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                      {msg.role === "user" && (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-gradient-to-br from-primary to-primary/50 text-white shadow-[0_0_15px_hsl(190_100%_50%/0.5)]">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      {msg.role === "ai" && (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-gradient-to-tr from-primary to-[#a855f7] text-white shadow-[0_0_15px_hsl(280_100%_50%/0.4)]">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      )}
                      
                      <div className={`p-3.5 rounded-2xl ${
                        msg.role === "user"
                          ? "bg-gradient-to-br from-primary/80 to-primary/40 backdrop-blur-md rounded-tr-sm text-white shadow-lg border border-primary/50"
                          : "bg-black/40 backdrop-blur-xl border border-white/10 rounded-tl-sm text-gray-100 shadow-xl"
                      }`}>
                        <p className="text-[14.5px] leading-relaxed tracking-wide font-medium">{msg.content}</p>
                      </div>
                    </div>

                    {/* In-line Recommendations */}
                    {msg.recommendations && (
                      <div className="pl-11 pr-2 w-full flex flex-col gap-3 mt-1 mb-2">
                        {msg.recommendations.map((item, ridx) => (
                          <Card key={item._id || ridx} className="glass-morphism border border-primary/30 bg-background/60 hover:border-primary transition-all rounded-2xl overflow-hidden flex flex-row relative w-full h-28 shadow-[0_4px_20px_hsl(190_100%_50%/0.08)] group">
                            <div className="w-1/3 h-full relative">
                              <img src={item.image_url || dishImage} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-background/90" />
                              <div className="absolute top-1 left-1 flex items-center gap-1 bg-background/80 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-primary/30">
                                <Sparkles className="w-2.5 h-2.5 text-primary" />
                                <span className="text-[8px] font-bold uppercase text-primary">AI</span>
                              </div>
                            </div>
                            <div className="w-2/3 p-2.5 flex flex-col justify-between z-10">
                              <div>
                                <h3 className="font-bold text-sm text-foreground line-clamp-1">{item.name}</h3>
                                <p className="text-[10px] text-muted-foreground italic line-clamp-2 mt-0.5">"{item.reason}"</p>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs font-bold text-gradient-primary">Rs. {Math.round(item.price)}</span>
                                <Button 
                                  variant="glow" 
                                  size="sm" 
                                  className="h-6 px-3 text-[10px] rounded-full shadow-md"
                                  onClick={() => {
                                    addItem({ id: item._id, name: item.name, price: item.price });
                                    toast({ title: "Added to cart", description: `${item.name} added.` });
                                  }}
                                >
                                  <Plus className="w-3 h-3 mr-0.5" /> Add
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Processing indicator */}
              {isProcessing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full justify-start mt-2">
                  <div className="flex gap-3 max-w-[85%] flex-row">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 bg-gradient-to-tr from-primary to-[#a855f7] text-white shadow-[0_0_15px_hsl(280_100%_50%/0.4)] animate-pulse">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="p-3.5 rounded-2xl bg-black/40 backdrop-blur-xl border border-[#a855f7]/30 rounded-tl-sm flex items-center gap-1.5 h-12 shadow-[0_0_15px_hsl(280_100%_50%/0.1)]">
                      <motion.div animate={{ height: ["30%", "100%", "30%"] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1.5 bg-gradient-to-t from-primary to-[#a855f7] rounded-full h-full" />
                      <motion.div animate={{ height: ["60%", "100%", "60%"] }} transition={{ repeat: Infinity, duration: 0.4 }} className="w-1.5 bg-gradient-to-t from-primary to-[#a855f7] rounded-full h-full" />
                      <motion.div animate={{ height: ["40%", "100%", "40%"] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-1.5 bg-gradient-to-t from-primary to-[#a855f7] rounded-full h-full" />
                      <span className="text-xs font-bold text-[#a855f7] ml-2 tracking-widest uppercase">Thinking</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment QR Dialog */}
      <Dialog open={checkoutStep === "waiting_payment"}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="sm:max-w-md text-center bg-black/90 backdrop-blur-3xl border-primary/20 text-foreground rounded-[2rem] z-[120] shadow-[0_20px_60px_hsl(190_100%_50%/0.3)]">
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
        <DialogContent className="sm:max-w-md text-center glass-morphism border-green-500/20 text-foreground rounded-2xl z-[100]">
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

      {/* Cinematic 3D Carousel Overlay */}
      <AnimatePresence>
        {activeModels.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-5xl max-h-[85vh] bg-black/80 backdrop-blur-2xl rounded-[2.5rem] border border-primary/20 shadow-2xl flex flex-col overflow-hidden"
            >
            {/* Top Bar */}
            <div className="flex justify-between items-center p-6 bg-gradient-to-b from-black/80 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/50 shadow-[0_0_20px_hsl(190_100%_50%/0.3)]">
                  <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white tracking-widest uppercase">3D Showcase</h2>
                  <p className="text-sm font-bold text-primary">Item {activeModelIndex + 1} of {activeModels.length}</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                {/* AR QR Code Scanner (Hidden on mobile) */}
                {activeModels[activeModelIndex]?.model_3d_url && (
                  <div className="hidden md:flex items-center gap-3 bg-white/5 pr-4 pl-2 py-2 rounded-2xl border border-white/10">
                    <div className="bg-white p-2 rounded-xl shadow-lg">
                      <QRCodeSVG 
                        value={`${window.location.origin}/ar?model=${encodeURIComponent(activeModels[activeModelIndex].model_3d_url)}`} 
                        size={96} 
                        level="L"
                        includeMargin={false}
                      />
                    </div>
                    <div className="flex flex-col max-w-[120px]">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-widest leading-tight">View on Phone</span>
                      <span className="text-[9px] text-white/70 leading-tight mt-0.5">Scan to open in AR</span>
                    </div>
                  </div>
                )}

                <Button 
                  variant="ghost" 
                size="icon" 
                onClick={() => { setActiveModels([]); setActiveModelIndex(0); }}
                className="rounded-full w-12 h-12 bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-6 h-6" />
                </Button>
              </div>
            </div>

            {/* Main Viewer Area */}
            <div className="flex-1 relative flex items-center justify-center">
              {activeModels.length > 1 && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setActiveModelIndex((prev) => (prev > 0 ? prev - 1 : activeModels.length - 1))}
                  className="absolute left-6 w-16 h-16 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 z-10 text-white shadow-xl backdrop-blur-md transition-all"
                >
                  <ChevronLeft className="w-8 h-8" />
                </Button>
              )}

              <div className="w-full max-w-4xl h-[50vh] relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeModelIndex}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    transition={{ duration: 0.4 }}
                    className="w-full h-full relative group"
                  >
                    <div className="absolute inset-0 bg-primary/5 rounded-[40px] border border-primary/20 blur-sm -z-10 group-hover:bg-primary/10 transition-all duration-500" />
                    <GLBModelViewer 
                      modelUrl={activeModels[activeModelIndex].model_3d_url} 
                      height="100%" 
                      autoRotate={true} 
                      showControls={true} 
                      scale={1.3}
                    />
                    
                    {/* Item Info Overlay */}
                    <div className="absolute bottom-[-2rem] inset-x-0 flex flex-col items-center justify-center pointer-events-none">
                      <h1 className="text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-primary to-white drop-shadow-2xl text-center">
                        {activeModels[activeModelIndex].name}
                      </h1>
                      <div className="mt-4 bg-black/60 backdrop-blur-lg px-6 py-2 rounded-full border border-primary/40 shadow-[0_0_20px_hsl(190_100%_50%/0.2)] pointer-events-auto">
                        <p className="text-xl font-bold text-white">Rs. {Math.round(activeModels[activeModelIndex].price)}</p>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {activeModels.length > 1 && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setActiveModelIndex((prev) => (prev < activeModels.length - 1 ? prev + 1 : 0))}
                  className="absolute right-6 w-16 h-16 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 z-10 text-white shadow-xl backdrop-blur-md transition-all"
                >
                  <ChevronRight className="w-8 h-8" />
                </Button>
              )}
            </div>

            {/* Add to Cart Button (Bottom Bar) */}
            <div className="p-8 flex justify-center mb-8">
              <Button 
                onClick={() => {
                  addItem({ 
                    id: activeModels[activeModelIndex]._id, 
                    name: activeModels[activeModelIndex].name, 
                    price: activeModels[activeModelIndex].price 
                  });
                  toast({ title: "Added to Cart", description: `${activeModels[activeModelIndex].name} added!` });
                  setActiveModels([]);
                }}
                className="h-16 px-12 rounded-full text-lg font-black bg-gradient-to-r from-primary to-[#a855f7] hover:scale-105 transition-all shadow-[0_0_30px_hsl(280_100%_50%/0.4)] text-white"
              >
                <Plus className="w-6 h-6 mr-2" /> Add to Cart
              </Button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default GlobalVoiceAssistant;

