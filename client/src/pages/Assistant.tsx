import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { api } from "../lib/api";
import { SectionHeading, DataBadge } from "../components/ui";
import { 
  Send, Sparkles, Sprout, Bot, User, Mic, 
  HelpCircle, ShieldCheck, MapPin, RefreshCw 
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  text: string;
  source?: string;
  note?: string;
  contextSnippet?: {
    crop?: string;
    topMarket?: string;
    topNetRealization?: number;
  };
  timestamp: string;
}

export default function Assistant() {
  const { user, profile } = useAuth();
  const { t, locale } = useLocale();
  const [crops, setCrops] = useState<any[]>([]);
  const [selectedCropId, setSelectedCropId] = useState("");
  const [district, setDistrict] = useState(profile?.district || "Guntur");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "Namaste! I am KisanSetu AI Saathi, your agricultural market intelligence companion. I am grounded in live regional mandi arrivals, transport rates, and quality standards. How can I assist you with your harvest or selling strategy today?",
      source: "gemini-ready",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const SUGGESTED_PROMPTS = [
    "Where should I sell my crop for the highest net profit?",
    "How does transport cost affect my final take-home price?",
    "What specific criteria are needed for Grade A quality?",
    "Is cold storage recommended for holding my produce right now?"
  ];

  useEffect(() => {
    api.get("/crops").then((data) => {
      setCrops(data);
      if (data.length > 0) setSelectedCropId(data[0].id);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(questionText?: string) {
    const textToSend = questionText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      role: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!questionText) setInput("");
    setLoading(true);

    try {
      const res = await api.post("/assistant/ask", {
        question: textToSend,
        cropId: selectedCropId,
        district: district,
        userId: user?.id,
        locale: locale
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: res.answer,
          source: res.source,
          note: res.note,
          contextSnippet: res.contextSnippet,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "I am having trouble reaching the market data service right now. Please try again shortly.",
          source: "network-fallback",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeading 
        title="KisanSetu AI Saathi (किसानसेतु एआई साथी)" 
        subtitle="Grounded market assistant powered by Google Gemini and verified regional mandi data"
        actions={
          <div className="flex items-center gap-2">
            <DataBadge type="LIVE" note="Grounded in platform database" />
          </div>
        }
      />

      {/* Grounding Context Bar */}
      <div className="card p-3.5 bg-brand-50/60 border-brand-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-medium text-brand-900">
          <Sparkles size={16} className="text-accent-400" />
          <span>Active Grounding Context:</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-stone-200">
            <span className="text-stone-500 font-semibold">Crop:</span>
            <select 
              value={selectedCropId} 
              onChange={(e) => setSelectedCropId(e.target.value)}
              className="bg-transparent font-bold text-stone-800 focus:outline-none cursor-pointer"
            >
              {crops.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-stone-200">
            <MapPin size={12} className="text-brand-600" />
            <span className="text-stone-500 font-semibold">District:</span>
            <select 
              value={district} 
              onChange={(e) => setDistrict(e.target.value)}
              className="bg-transparent font-bold text-stone-800 focus:outline-none cursor-pointer"
            >
              {["Guntur", "Krishna", "Kurnool", "Anantapur", "Nellore", "Chittoor", "Visakhapatnam"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Chat Container */}
      <div className="card overflow-hidden flex flex-col h-[65vh] border border-stone-200 shadow-card">
        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((m, idx) => (
            <div 
              key={idx} 
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <div className="w-8 h-8 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                  <Bot size={18} />
                </div>
              )}

              <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-subtle ${
                m.role === "user" 
                  ? "bg-brand-600 text-white rounded-tr-none" 
                  : "bg-white border border-stone-200 text-stone-800 rounded-tl-none"
              }`}>
                {/* Assistant header tag */}
                {m.role === "assistant" && (
                  <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-stone-100 text-[11px]">
                    <span className="font-bold text-brand-700 flex items-center gap-1">
                      <Sparkles size={12} className="text-amber-500" />
                      KisanSetu AI Saathi
                    </span>
                    {m.source?.includes("gemini") ? (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Gemini 1.5 Flash
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-stone-600 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                        Platform Data Engine
                      </span>
                    )}
                  </div>
                )}

                <div className="whitespace-pre-wrap">{m.text}</div>

                {/* Grounding Context Snippet if available */}
                {m.contextSnippet?.topMarket && (
                  <div className="mt-2.5 pt-2 border-t border-stone-100 bg-brand-50/50 p-2 rounded-lg text-[11px] text-brand-900">
                    <span className="font-bold">Grounded Mandi Match:</span> {m.contextSnippet.topMarket} — Net In-Hand: <span className="font-extrabold text-brand-700">₹{m.contextSnippet.topNetRealization}/q</span>
                  </div>
                )}

                {/* Note / Disclaimer */}
                {m.note && (
                  <div className="text-[10px] text-stone-400 mt-2 italic flex items-center gap-1">
                    <ShieldCheck size={11} />
                    <span>{m.note}</span>
                  </div>
                )}

                <div className={`text-[10px] mt-1.5 text-right ${m.role === "user" ? "text-brand-200" : "text-stone-400"}`}>
                  {m.timestamp}
                </div>
              </div>

              {m.role === "user" && (
                <div className="w-8 h-8 rounded-xl bg-stone-200 text-stone-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={18} />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0">
                <Bot size={18} />
              </div>
              <div className="card p-3.5 bg-stone-50 border-stone-200 text-xs text-stone-600 flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin text-brand-600" />
                <span>AI Saathi is gathering regional mandi prices and formulating answer...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 border-t border-stone-200 bg-stone-50/80">
          <form 
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2"
          >
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about prices, quality grading, mandi comparisons, or storage in any language..."
              className="input bg-white shadow-sm flex-1"
              disabled={loading}
            />
            <button 
              type="button" 
              onClick={() => send("Where should I sell my produce today?")}
              className="p-2.5 rounded-lg border border-stone-200 bg-white text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition-colors"
              title="Voice simulation"
            >
              <Mic size={18} />
            </button>
            <button 
              type="submit" 
              disabled={loading || !input.trim()} 
              className="btn-primary py-2.5 px-4"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* Suggested Questions Pills */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-dark-muted mb-2 flex items-center gap-1.5">
          <HelpCircle size={13} />
          Suggested Inquiries
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              onClick={() => send(prompt)}
              disabled={loading}
              className="px-3 py-1.5 rounded-full bg-white border border-stone-200 hover:border-brand-400 hover:bg-brand-50 text-xs text-stone-700 font-medium transition-all shadow-subtle text-left"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
