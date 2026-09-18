import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../i18n/LocaleContext";
import { 
  Sprout, TrendingUp, ShieldCheck, Sparkles, Warehouse, Users, 
  ArrowRight, CheckCircle2, ChevronDown, MapPin, Truck, Award
} from "lucide-react";
import { useState } from "react";

export default function Landing() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const FAQS = [
    {
      q: "How does KisanSetu calculate Net Realization?",
      a: "Rather than simply showing the mandi headline price, KisanSetu subtracts actual estimated transportation costs based on road distance, loading handling fees, and mandi cess. This guarantees farmers see what will actually land in their bank accounts."
    },
    {
      q: "Who verifies the buyers and produce quality?",
      a: "Buyers undergo GST and business verification before making formal bids. Lots can be verified by local FPO field officers using standard Grade A/B/C physical parameters including moisture and foreign matter checks."
    },
    {
      q: "What is KisanSetu AI Saathi?",
      a: "AI Saathi is an AI agriculture companion powered by Google Gemini and grounded with live mandi prices. It explains market trends, compares selling options, and suggests optimal harvest timing without inventing numbers."
    },
    {
      q: "Can smallholder farmers sell produce through FPOs?",
      a: "Yes! FPOs can aggregate small lots from multiple member farmers into bulk institutional shipments, unlocking higher prices from corporate wholesalers and exporters."
    }
  ];

  return (
    <div className="min-h-screen bg-page text-dark-text flex flex-col selection:bg-brand-100 selection:text-brand-900">
      {/* Top Navbar */}
      <nav className="border-b border-stone-200/80 bg-white/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200/80 flex items-center justify-center text-brand-700 shadow-sm">
              <Sprout size={22} />
            </div>
            <div>
              <span className="font-bold text-lg text-stone-900 tracking-tight">KisanSetu</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                Digital Agri-Market
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/dashboard" className="btn-primary text-xs">
                Go to Dashboard <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-secondary text-xs">
                  {t("login.signIn")}
                </Link>
                <Link to="/register" className="btn-primary text-xs">
                  {t("login.createAccount")}
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden border-b border-stone-200/60 bg-gradient-to-b from-brand-50/50 via-white to-page">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-200/80 text-brand-800 text-xs font-semibold mb-6 shadow-sm">
            <Sparkles size={14} className="text-accent-400" />
            <span>Smart Agricultural Market Linkage & Price Discovery</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-stone-900 tracking-tight leading-[1.15]">
            Sell Smarter. <span className="text-brand-600">Earn Better.</span>
          </h1>

          <p className="mt-5 text-base sm:text-lg text-dark-muted max-w-2xl mx-auto leading-relaxed">
            Connecting Indian farmers, FPOs, and verified buyers through transparent net-realization discovery, intelligent storage linkage, and AI-guided market decisions.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <Link to={user ? "/dashboard" : "/login"} className="btn-primary text-sm px-6 py-3 w-full sm:w-auto shadow-md hover:shadow-lg">
              Explore Markets & Prices <ArrowRight size={16} />
            </Link>
            <Link to={user ? "/assistant" : "/register"} className="btn-secondary text-sm px-6 py-3 w-full sm:w-auto">
              Meet AI Saathi Assistant
            </Link>
          </div>

          {/* Value Stats Banner */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
            <div className="card p-4 bg-white/80 backdrop-blur">
              <div className="text-2xl font-bold text-brand-600">₹450+/q</div>
              <div className="text-xs text-dark-muted mt-0.5">Average Realization Gain via Smart Routing</div>
            </div>
            <div className="card p-4 bg-white/80 backdrop-blur">
              <div className="text-2xl font-bold text-brand-600">100%</div>
              <div className="text-xs text-dark-muted mt-0.5">Transparent Transport Deductions</div>
            </div>
            <div className="card p-4 bg-white/80 backdrop-blur">
              <div className="text-2xl font-bold text-brand-600">Verified</div>
              <div className="text-xs text-dark-muted mt-0.5">Institutional Buyers & FPO Networks</div>
            </div>
            <div className="card p-4 bg-white/80 backdrop-blur">
              <div className="text-2xl font-bold text-brand-600">4 Languages</div>
              <div className="text-xs text-dark-muted mt-0.5">English, Hindi, Marathi & Telugu</div>
            </div>
          </div>
        </div>
      </header>

      {/* Feature Grid */}
      <section className="py-16 md:py-20 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight">
            Built for Farmer Prosperity
          </h2>
          <p className="mt-2 text-sm text-dark-muted">
            From field harvest to final digital settlement, every step empowers the producer.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="card p-6 hover:shadow-card hover:border-brand-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
              <TrendingUp size={24} />
            </div>
            <h3 className="font-bold text-base text-stone-900 mb-1.5">Net Realization Discovery</h3>
            <p className="text-xs text-dark-muted leading-relaxed">
              Don't get tricked by high headline prices in distant mandis. Our algorithm factors in mileage, fuel rates, and cess to show your real in-hand income.
            </p>
          </div>

          {/* Card 2 */}
          <div className="card p-6 hover:shadow-card hover:border-brand-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-4">
              <Sparkles size={24} />
            </div>
            <h3 className="font-bold text-base text-stone-900 mb-1.5">KisanSetu AI Saathi</h3>
            <p className="text-xs text-dark-muted leading-relaxed">
              Ask questions in your native tongue about market arrivals, grade criteria, and whether holding stock in cold storage pays off for your crop.
            </p>
          </div>

          {/* Card 3 */}
          <div className="card p-6 hover:shadow-card hover:border-brand-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center mb-4">
              <ShieldCheck size={24} />
            </div>
            <h3 className="font-bold text-base text-stone-900 mb-1.5">Verified B2B Marketplace</h3>
            <p className="text-xs text-dark-muted leading-relaxed">
              Connect directly with verified processors, retail chains, and institutional buyers. Receive counter-offers and track milestone payments safely.
            </p>
          </div>

          {/* Card 4 */}
          <div className="card p-6 hover:shadow-card hover:border-brand-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-4">
              <Warehouse size={24} />
            </div>
            <h3 className="font-bold text-base text-stone-900 mb-1.5">Storage & Warehouse Linkage</h3>
            <p className="text-xs text-dark-muted leading-relaxed">
              Locate nearby certified cold storages, check daily storage rates per quintal, and evaluate distress-sale avoidance strategies.
            </p>
          </div>

          {/* Card 5 */}
          <div className="card p-6 hover:shadow-card hover:border-brand-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mb-4">
              <Users size={24} />
            </div>
            <h3 className="font-bold text-base text-stone-900 mb-1.5">FPO Produce Aggregation</h3>
            <p className="text-xs text-dark-muted leading-relaxed">
              FPOs aggregate smallholder harvests into commercial lots, boosting bargaining leverage and unlocking bulk transport economies of scale.
            </p>
          </div>

          {/* Card 6 */}
          <div className="card p-6 hover:shadow-card hover:border-brand-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mb-4">
              <Award size={24} />
            </div>
            <h3 className="font-bold text-base text-stone-900 mb-1.5">Standardized Quality Grading</h3>
            <p className="text-xs text-dark-muted leading-relaxed">
              Clear Grade A/B/C specifications based on size, moisture, and purity ensure fair market valuation and eliminate arbitrary buyer deductions.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-14 bg-white border-y border-stone-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-2xl font-bold text-stone-900">How KisanSetu Works</h2>
            <p className="text-xs text-dark-muted mt-1">4 simple steps to maximize crop earnings</p>
          </div>

          <div className="grid sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/60 text-center">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white font-bold text-sm flex items-center justify-center mx-auto mb-2">1</div>
              <h4 className="font-bold text-xs text-stone-900">List Produce Lot</h4>
              <p className="text-[11px] text-stone-500 mt-1">Specify crop, quantity, quality grade, and expected base price.</p>
            </div>
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/60 text-center">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white font-bold text-sm flex items-center justify-center mx-auto mb-2">2</div>
              <h4 className="font-bold text-xs text-stone-900">Compare Mandis</h4>
              <p className="text-[11px] text-stone-500 mt-1">View real net realization rankings across nearby APMC yards.</p>
            </div>
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/60 text-center">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white font-bold text-sm flex items-center justify-center mx-auto mb-2">3</div>
              <h4 className="font-bold text-xs text-stone-900">Receive B2B Offers</h4>
              <p className="text-[11px] text-stone-500 mt-1">Get direct bids from verified wholesalers with secure payment terms.</p>
            </div>
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/60 text-center">
              <div className="w-8 h-8 rounded-full bg-brand-600 text-white font-bold text-sm flex items-center justify-center mx-auto mb-2">4</div>
              <h4 className="font-bold text-xs text-stone-900">Dispatch & Get Paid</h4>
              <p className="text-[11px] text-stone-500 mt-1">Coordinate logistics and track milestone payment releases safely.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-stone-900">Frequently Asked Questions</h2>
          <p className="text-xs text-dark-muted mt-1">Everything you need to know about the platform</p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="card overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left p-4 font-semibold text-xs sm:text-sm text-stone-800 flex items-center justify-between hover:bg-stone-50 transition-colors"
              >
                <span>{faq.q}</span>
                <ChevronDown size={16} className={`text-stone-400 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
              </button>
              {openFaq === i && (
                <div className="p-4 pt-0 text-xs text-stone-600 border-t border-stone-100 bg-stone-50/50 leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-stone-200 bg-white py-8 text-xs text-dark-muted">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sprout className="text-brand-600" size={18} />
            <span className="font-bold text-stone-800">KisanSetu Platform</span>
            <span className="text-[11px] text-stone-400">© 2026 Smart Agri Tech</span>
          </div>
          <div className="flex items-center gap-4 text-stone-600">
            <Link to="/login" className="hover:text-stone-900">Sign In</Link>
            <Link to="/register" className="hover:text-stone-900">Register</Link>
            <Link to="/assistant" className="hover:text-stone-900">AI Saathi</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
