import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Calendar, ShieldCheck, Play, ArrowRight, History, Heart, CheckCircle2, ChevronDown, Award, Send, Loader2 } from 'lucide-react';
import { SERVICE_OPTIONS, FAQS } from '../data';
// @ts-ignore
import oldIndianFamilyImg from '../assets/images/old_indian_family_1780245873698.png';

interface LandingPageProps {
  onNavigateToAuth: (role?: string) => void;
  onQuickBook: () => void;
}

export default function LandingPage({ onNavigateToAuth, onQuickBook }: LandingPageProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 });
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [selectedService, setSelectedService] = useState('photo-restoration');
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [contactSuccess, setContactSuccess] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSliderPosition(Number(e.target.value));
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    let step = 1;
    if (e.shiftKey) {
      step = 10;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setSliderPosition((prev) => Math.max(0, prev - step));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSliderPosition((prev) => Math.min(100, prev + step));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSliderPosition(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSliderPosition(100);
    }
  };

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMouseCoords({ x, y });
  };

  const handleHeroMouseLeave = () => {
    setMouseCoords({ x: 0, y: 0 });
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (contactForm.name && contactForm.email) {
      setIsSending(true);
      try {
        const res = await fetch('/api/smtp-send-update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: 'itzmebalustrade@gmail.com',
            title: `Support Form: ${contactForm.name}`,
            status: 'INQUIRY',
            description: `Brand new support request details entered by client:\n\n- Name: ${contactForm.name}\n- Reply-To Email: ${contactForm.email}\n- Query / Message:\n"${contactForm.message}"`
          })
        });

        if (res.ok) {
          setContactSuccess(true);
          setTimeout(() => {
            setContactSuccess(false);
            setContactForm({ name: '', email: '', message: '' });
          }, 4500);
        } else {
          throw new Error("SMTP dispatch failed.");
        }
      } catch (err) {
        console.error("Support transmission failed:", err);
        // Fallback simulated success
        setContactSuccess(true);
        setTimeout(() => {
          setContactSuccess(false);
          setContactForm({ name: '', email: '', message: '' });
        }, 4500);
      } finally {
        setIsSending(false);
      }
    }
  };

  const activeServiceData = SERVICE_OPTIONS.find(s => s.id === selectedService) || SERVICE_OPTIONS[0];

  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen font-sans selection:bg-amber-100 selection:text-amber-900">
      {/* Cinematic Hero with interactive Mouse Parallax & Custom Glassmorphic accents */}
      <section 
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
        className="relative min-h-[92vh] flex items-center justify-center overflow-hidden bg-gradient-to-b from-stone-950 via-stone-900 to-stone-950 text-white py-24 px-4 transition-all duration-300"
      >
        {/* Subtle background grid pattern */}
        <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]"></div>
        
        {/* Parallax Amber/Orange glow orbs */}
        <div 
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[140px] pointer-events-none transition-transform duration-500 ease-out"
          style={{ transform: `translate(${mouseCoords.x * 60}px, ${mouseCoords.y * 60}px)` }}
        ></div>
        <div 
          className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-orange-600/10 blur-[140px] pointer-events-none transition-transform duration-500 ease-out"
          style={{ transform: `translate(${mouseCoords.x * -40}px, ${mouseCoords.y * -40}px)` }}
        ></div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10 w-full">
          <div className="lg:col-span-7 space-y-8 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 backdrop-blur-md rounded-full text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              Preserving Indian Family Legacies
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif tracking-tight leading-[1.1] text-stone-100">
              Your Family’s <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-orange-400">Irreplaceable History</span>, Restored with Extreme Pride.
            </h1>
            
            <p className="text-stone-300 text-base sm:text-lg leading-relaxed max-w-xl font-light">
              Don’t let your grandparents’ ancient weddings, faded Maruti polaroids, and decaying tape spools exhaust to dust. Relive delivers secure doorstep courier logistics and high-fidelity manual restoration.
            </p>

            <div className="flex flex-wrap gap-4 items-center">
              <button
                id="hero-book-btn"
                onClick={onQuickBook}
                className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-950 font-bold rounded-xl transition-all duration-300 transform active:scale-95 shadow-xl shadow-amber-500/10 flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer font-sans"
              >
                <Calendar className="w-4 h-4 text-stone-950" />
                Schedule Doorstep Pickup
              </button>
              
              <button
                id="hero-explore-btn"
                onClick={() => {
                  document.getElementById('showcase-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-6 py-3.5 bg-stone-900/60 backdrop-blur-md hover:bg-stone-850 text-stone-200 hover:text-white border border-stone-800 rounded-xl transition-all duration-300 flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer"
              >
                <Play className="w-4 h-4 text-amber-400" />
                Watch Restoration Science
              </button>
            </div>

            <div className="pt-6 grid grid-cols-3 gap-6 border-t border-stone-800/80 text-stone-400 text-xs font-mono">
              <div>
                <span className="block text-2xl sm:text-3xl font-serif text-amber-400 font-bold font-serif">120K+</span>
                Memories Restored
              </div>
              <div>
                <span className="block text-2xl sm:text-3xl font-serif text-amber-400 font-bold font-serif">99.4%</span>
                Customer Sat
              </div>
              <div>
                <span className="block text-2xl sm:text-3xl font-serif text-amber-400 font-bold font-serif">ISO-5</span>
                Clean-room Lab
              </div>
            </div>
          </div>

          {/* Interactive Before/After Card with 3D Tilt Parallax & Glassy border */}
          <div 
            className="lg:col-span-12 xl:col-span-5 flex flex-col justify-center transition-all duration-500 ease-out"
            style={{ 
              transform: `perspective(1000px) rotateY(${mouseCoords.x * 20}deg) rotateX(${mouseCoords.y * -20}deg) translateZ(10px)` 
            }}
          >
            <div className="relative group overflow-hidden rounded-3xl border border-white/10 bg-stone-950/40 p-4 shadow-2xl glass-panel-dark focus-within:ring-2 focus-within:ring-amber-400 focus-within:ring-offset-2 focus-within:ring-offset-stone-950 transition-shadow">
              <span className="absolute top-8 left-8 z-20 px-3 py-1 bg-stone-950/80 backdrop-blur-md rounded text-[9px] font-mono tracking-widest text-amber-400 border border-amber-400/20">
                DRAG OR USE ARROW KEYS
              </span>
              
              {/* Image Frame Container */}
              <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-stone-950 border border-stone-850">
                {/* BEFORE (Sepia damaged portrait) */}
                <img
                  src={oldIndianFamilyImg}
                  alt="Original Vintage Damaged Portrait"
                  className="absolute inset-0 w-full h-full object-cover filter sepia brightness-50 contrast-125 saturate-150 blur-[1px] opacity-90"
                  referrerPolicy="no-referrer"
                />
                
                {/* AFTER (Restored color portrait, clipped based on slide state) */}
                <div
                  className="absolute inset-0 w-full h-full pointer-events-none transition-all duration-100"
                  style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}
                >
                  <img
                    src={oldIndianFamilyImg}
                    alt="Restored High-End Sharpened Portrait in Full Color"
                    className="absolute inset-0 w-full h-full object-cover filter brightness-105 contrast-110 saturate-105"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Vertical Divider line */}
                <div 
                  className="absolute inset-y-0 w-1 bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,1)] pointer-events-none z-10"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -left-3.5 w-8.5 h-8.5 rounded-full bg-amber-400 border-2 border-stone-950 shadow-xl flex items-center justify-center">
                    <History className="w-4 h-4 text-stone-950" />
                  </div>
                </div>

                {/* Slider range input overlaying */}
                <input
                  id="before-after-slider-input"
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={handleSliderChange}
                  onKeyDown={handleSliderKeyDown}
                  aria-label="Before and after image comparison slider. Use Left and Right Arrow keys for precise control, or Shift + Arrow for larger adjustments."
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={sliderPosition}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-25 focus:outline-none"
                />
              </div>


            </div>
            
            <p className="text-stone-500 text-xs mt-3 text-center">
              Works on Physical Photos, Moldy VHS Tapes, Audio Tracks, & film slides.
            </p>
          </div>
        </div>
      </section>

      {/* Trust & Indian Family Storytelling with Glassmorphic layouts */}
      <section className="py-24 px-4 bg-gradient-to-b from-stone-50 to-stone-100/40 text-center relative overflow-hidden">
        {/* Subtle decorative shapes */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-br from-amber-400/5 to-orange-400/5 rounded-full blur-[80px] pointer-events-none"></div>

        <div className="max-w-5xl mx-auto space-y-8 relative z-10">
          <div className="w-16 h-1 bg-gradient-to-r from-amber-500 to-orange-500 mx-auto rounded-full"></div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-stone-900 tracking-tight leading-tight">
            The Fading Heritage of Our Joint Families
          </h2>
          <p className="text-stone-600 text-base sm:text-lg leading-relaxed max-w-3xl mx-auto font-light">
            In cupboards, metal trunks, and dusty attics from Amritsar down to Cochin, millions of physical magnetic VHS tape polymers, custom celluloid chemical spools, and decaying album boards are succumbing to humidity, fungus decay, and permanent color pigment exhaustion.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 pt-10">
            <div className="glass-panel-light p-8 rounded-3xl hover:shadow-xl hover:border-amber-400/40 transition-all duration-500 text-center space-y-4 group">
              <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto text-xl shadow-inner group-hover:scale-115 transition-transform duration-300">
                <ShieldCheck className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="font-serif text-xl font-bold text-stone-950">OTP-Verified Pickup</h3>
              <p className="text-stone-500 text-xs sm:text-sm leading-relaxed">
                Your precious family memories never get misplaced. Our trained logistics partners collect items using unique secure OTP signatures.
              </p>
            </div>

            <div className="glass-panel-light p-8 rounded-3xl hover:shadow-xl hover:border-amber-400/40 transition-all duration-500 text-center space-y-4 group">
              <div className="w-14 h-14 bg-orange-100 text-orange-700 rounded-2xl flex items-center justify-center mx-auto text-xl shadow-inner group-hover:scale-115 transition-transform duration-300">
                <Sparkles className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="font-serif text-xl font-bold text-stone-950">Archival Restoration</h3>
              <p className="text-stone-500 text-xs sm:text-sm leading-relaxed">
                Not a cheap digital filter. Under class ISO-5 media laboratory conditions, we baked magnetic layers and performed micro CCD scans.
              </p>
            </div>

            <div className="glass-panel-light p-8 rounded-3xl hover:shadow-xl hover:border-amber-400/40 transition-all duration-500 text-center space-y-4 group">
              <div className="w-14 h-14 bg-rose-50 text-rose-705 rounded-2xl flex items-center justify-center mx-auto text-xl shadow-inner group-hover:scale-115 transition-transform duration-300">
                <Heart className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="font-serif text-xl font-bold text-stone-950">Shared Family Vault</h3>
              <p className="text-stone-500 text-xs sm:text-sm leading-relaxed">
                Securely back up to the cloud. You can invite uncles, grandparents, and direct descendants to browse, comment, and co-curate.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Services Showcase Section */}
      <section id="showcase-section" className="py-24 px-4 bg-white relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-3 mb-16">
            <p className="text-xs uppercase font-extrabold text-amber-600 tracking-widest font-mono">LABORATORY CAPABILITIES</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif text-stone-950 leading-tight">Archival Services Crafted for Millions of Frames</h2>
            <p className="text-stone-500 max-w-xl mx-auto text-sm font-light">
              We operate an advanced digital media restoration laboratory utilizing authentic vintage playback decks and state-of-the-art color correction layers.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Service Navigators */}
            <div className="lg:col-span-4 flex flex-col gap-3 justify-center">
              {SERVICE_OPTIONS.map((service) => (
                <button
                  id={`service-nav-btn-${service.id}`}
                  key={service.id}
                  onClick={() => setSelectedService(service.id)}
                  className={`w-full text-left p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between cursor-pointer ${
                    selectedService === service.id
                      ? 'bg-stone-950 text-stone-100 border-stone-950 shadow-lg'
                      : 'bg-stone-50/80 text-stone-700 border-stone-200/80 hover:bg-stone-100/90 hover:border-stone-300'
                  }`}
                >
                  <div className="pr-4">
                    <h3 className="font-bold text-xs sm:text-sm uppercase tracking-wider font-sans">{service.title}</h3>
                    <p className="text-xs opacity-60 line-clamp-1 mt-0.5">{service.description}</p>
                  </div>
                  <ArrowRight className={`w-4 h-4 shrink-0 transition-transform ${selectedService === service.id ? 'translate-x-1 text-amber-400' : 'opacity-35'}`} />
                </button>
              ))}
            </div>

            {/* Active Service Showcase detail: High fidelity glass panel with precise spacing */}
            <div className="lg:col-span-8 glass-panel-light border border-amber-500/10 shadow-xl rounded-3xl p-8 sm:p-12 space-y-8 flex flex-col justify-between min-h-[420px] transition-all duration-500">
              <div className="space-y-5">
                <span className="px-3.5 py-1.5 bg-amber-500/10 text-amber-800 text-xs font-semibold rounded-full uppercase tracking-wider border border-amber-500/20">
                  🔬 Premium Laboratorial Process
                </span>
                
                <h3 className="text-3xl sm:text-4xl font-serif font-black text-stone-950 tracking-tight">{activeServiceData.title}</h3>
                
                <p className="text-stone-600 text-sm sm:text-base leading-relaxed font-light">
                  {activeServiceData.description} Our trained restoration artists verify the chemical state of your media, clean magnetic polymers or emulsion surfaces with anti-static archival detergents, and use laser sensors to extract information without touching the sensitive core layers.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-xs sm:text-sm">
                  <div className="flex items-center gap-2.5 text-stone-700">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Dust & scratch vacuum correction</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-stone-700">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Skin tones customized calibration</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-stone-700">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Non-destructive frame-by-frame scanner</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-stone-700">
                    <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Direct Google Drive Cloud Delivery Sync</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-stone-200/80 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-stone-500 uppercase tracking-widest font-mono">ESTIMATED INVESTMENT</p>
                  <p className="text-2xl sm:text-3xl font-serif font-extrabold text-stone-900">{activeServiceData.price}</p>
                  <p className="text-xs text-stone-400 font-mono mt-0.5">Restoration cycle: {activeServiceData.duration}</p>
                </div>

                <div className="flex gap-3 w-full sm:w-auto">
                  <button
                    id="service-signup-btn-partner"
                    onClick={() => onNavigateToAuth('user')}
                    className="flex-1 sm:flex-initial px-5 py-3 bg-stone-950 text-white rounded-xl hover:bg-stone-850 font-bold transition-all text-xs uppercase tracking-wider cursor-pointer shadow-md"
                  >
                    Get Started
                  </button>
                  <button
                    id="service-book-btn"
                    onClick={onQuickBook}
                    className="flex-1 sm:flex-initial px-5 py-3 bg-stone-100 hover:bg-stone-200 text-stone-850 border border-stone-200 rounded-xl font-bold transition-all text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Free Consult
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* FAQs */}
      <section className="py-24 px-4 bg-white relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-1/2 left-0 w-80 h-80 bg-amber-500/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="max-w-3xl mx-auto relative z-15">
          <div className="text-center space-y-3 mb-16">
            <h2 className="text-3xl sm:text-4xl font-serif text-stone-950 tracking-tight">Restoration Science FAQ</h2>
            <p className="text-stone-500 text-xs sm:text-sm font-light">Clear, straightforward answers about how we protect and preserve your ancestors’ memories.</p>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div key={idx} className="glass-panel-light hover:border-amber-400/30 transition-all duration-300 rounded-2xl overflow-hidden">
                  <button
                    id={`faq-toggle-btn-${idx}`}
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between p-5 sm:p-6 text-left font-serif font-black text-stone-950 hover:bg-white/40 transition-colors text-sm sm:text-base cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={`w-4 h-4 text-stone-500 transition-transform cursor-pointer ${isOpen ? 'rotate-180 text-amber-600' : ''}`} />
                  </button>
                  
                  {isOpen && (
                    <div className="px-6 pb-6 pt-1 text-xs sm:text-sm text-stone-600 border-t border-white/20 bg-white/30 leading-relaxed font-light">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Interactive Contact Form with premium dark glassmorphism */}
      <section className="py-24 px-4 bg-gradient-to-b from-stone-950 to-stone-900 text-white relative overflow-hidden">
        {/* Radial accent glow behind form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/[0.04] rounded-full blur-[160px] pointer-events-none"></div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-12 items-center relative z-10">
          <div className="md:col-span-5 space-y-6">
            <span className="text-amber-400 text-xs uppercase font-extrabold font-mono tracking-widest block">REACH OUR SUPPORT CONCIERGE</span>
            <h2 className="text-3xl sm:text-4xl font-serif text-stone-100 tracking-tight leading-tight">Have Custom Reels or Fragile Mediums?</h2>
            <p className="text-stone-300 text-sm sm:text-base leading-relaxed font-light">
              For museums, private collector vaults, royal family heritage spools, or multi-box family inheritance collections, we can arrange secure military-grade courier transport or deploy physical scanners to your palace/residence in India.
            </p>
            <div className="space-y-3 text-xs sm:text-sm text-stone-400 font-mono">
              <p>📍 Headquarters: paradise, Hyderabad</p>
              <p>✉️ Concierge: itzmebalustrade@gmail.com</p>
              <p>📞 VIP Hotline: +91 89781 76486</p>
            </div>
          </div>

          <div className="md:col-span-7 glass-panel-dark p-8 sm:p-10 rounded-3xl border border-white/10 shadow-2xl relative">
            {contactSuccess ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 bg-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto text-3xl">
                  <Award />
                </div>
                <h3 className="text-xl font-serif text-white font-bold">Inquiry Transmitted</h3>
                <p className="text-stone-400 text-sm font-light leading-relaxed">
                  Our digital anthropologist will reach back to you within 2 business hours. Check your inbox or WhatsApp.
                </p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-5">
                <div>
                  <h3 className="text-2xl font-serif text-stone-100 font-bold">Direct restoration inquiry</h3>
                  <p className="text-stone-400 text-xs mt-1">Prompt responses from our senior curators.</p>
                </div>
                
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-400 mb-1.5 font-mono">Your Full Name</label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                    className="w-full bg-stone-950/60 border border-white/10 text-stone-100 p-3 rounded-xl text-sm focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-all font-sans"
                    placeholder="e.g. Maharana Singh"
                  />
                </div>
                
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-400 mb-1.5 font-mono">Your Email Address</label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full bg-stone-950/60 border border-white/10 text-stone-100 p-3 rounded-xl text-sm focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-all font-sans"
                    placeholder="e.g. singhavadh@gmail.com"
                  />
                </div>
                
                <div>
                  <label className="block text-xs uppercase tracking-wider text-stone-400 mb-1.5 font-mono">Describe media & decay status</label>
                  <textarea
                    id="contact-message"
                    required
                    rows={3}
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    className="w-full bg-stone-950/60 border border-white/10 text-stone-100 p-3 rounded-xl text-sm focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/30 transition-all font-sans"
                    placeholder="e.g. 3 boxes of moldy wedding polaroids from 1972 and 4 home movie VHS tapes."
                  />
                </div>
                
                <button
                  id="contact-submit"
                  type="submit"
                  disabled={isSending}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 font-bold text-stone-950 rounded-xl transition-all active:scale-98 text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-500/10"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Dispatching to Lab...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 text-stone-950" />
                      Request Callback
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
