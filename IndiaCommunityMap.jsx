import React, { useState, useEffect, useRef } from 'react';
import AOS from 'aos';
import 'aos/dist/aos.css';

// ── City & PIN Code Database ──────────────────────────────────────────────────
const CITIES = [
  { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', pin: '400001', lng: 72.88, lat: 19.07, members: '12.4K', orgs: '340', hubs: '18 Local Chapters' },
  { id: 'delhi', name: 'Delhi NCR', state: 'Delhi', pin: '110001', lng: 77.10, lat: 28.70, members: '9.8K', orgs: '285', hubs: '14 Local Chapters' },
  { id: 'hyderabad', name: 'Hyderabad', state: 'Telangana', pin: '500001', lng: 78.48, lat: 17.38, members: '7.2K', orgs: '198', hubs: '12 Local Chapters' },
  { id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', pin: '560001', lng: 77.59, lat: 12.97, members: '5.6K', orgs: '164', hubs: '10 Local Chapters' },
  { id: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', pin: '226001', lng: 80.95, lat: 26.85, members: '4.8K', orgs: '138', hubs: '9 Local Chapters' },
  { id: 'srinagar', name: 'Srinagar', state: 'J&K', pin: '190001', lng: 74.80, lat: 34.08, members: '2.4K', orgs: '65', hubs: '5 Local Chapters' },
  { id: 'patna', name: 'Patna', state: 'Bihar', pin: '800001', lng: 85.14, lat: 25.60, members: '3.2K', orgs: '88', hubs: '7 Local Chapters' },
  { id: 'kochi', name: 'Kochi', state: 'Kerala', pin: '682001', lng: 76.26, lat: 9.93, members: '2.6K', orgs: '72', hubs: '6 Local Chapters' },
];

const CATEGORIES = [
  { id: 'all', label: 'All Services', icon: '🌐' },
  { id: 'education', label: 'Education & Scholarships', icon: '🎓' },
  { id: 'healthcare', label: 'Healthcare & Aid', icon: '🏥' },
  { id: 'business', label: 'Business & Trade', icon: '💼' },
  { id: 'jobs', label: 'Jobs & Mentorship', icon: '🚀' },
];

export default function IndiaCommunityMap() {
  const [selectedCity, setSelectedCity] = useState(CITIES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [scrollProgress, setScrollProgress] = useState(0); // 0 (Hero) to 1 (Discovery Zoomed)
  const [isLocating, setIsLocating] = useState(false);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // ── Initialize AOS & Scroll Listener ───────────────────────────────────────
  useEffect(() => {
    // Initialize Animate On Scroll
    AOS.init({
      duration: 800,
      easing: 'ease-out-cubic',
      once: false,
      mirror: true,
      offset: 100,
    });

    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Calculate how far user has scrolled through the Hero -> Discovery transition
      // Progress moves from 0 to 1 as the discovery section approaches viewport center
      const progress = Math.min(1, Math.max(0, (windowHeight - rect.top) / (windowHeight * 0.8)));
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Canvas Map Render Engine ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let animationFrameId;
    let animTime = 0;

    const renderMap = () => {
      animTime += 0.03;
      const width = canvas.width = canvas.parentElement.clientWidth || 600;
      const height = canvas.height = canvas.parentElement.clientHeight || 500;

      ctx.clearRect(0, 0, width, height);

      // Interpolate camera zoom and focal point based on scroll progress & selected city
      const staticCenter = { lng: 78.96, lat: 20.59 }; // India center
      const currentLng = staticCenter.lng + (selectedCity.lng - staticCenter.lng) * scrollProgress;
      const currentLat = staticCenter.lat + (selectedCity.lat - staticCenter.lat) * scrollProgress;
      const currentZoom = 1.1 + (2.4 - 1.1) * scrollProgress;

      const baseScale = Math.min(width, height) / 32 * currentZoom;

      const project = (lng, lat) => {
        const x = width / 2 + (lng - currentLng) * baseScale;
        const y = height / 2 - (lat - currentLat) * baseScale;
        return { x, y };
      };

      // 1. Render Map Grid Background
      ctx.strokeStyle = `rgba(11, 143, 85, ${0.05 + scrollProgress * 0.08})`;
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }

      // 2. Render Connecting Arc Lines between Cities
      CITIES.forEach((c1, i) => {
        CITIES.slice(i + 1).forEach(c2 => {
          const p1 = project(c1.lng, c1.lat);
          const p2 = project(c2.lng, c2.lat);

          // Only draw if within bounds
          if (p1.x > -50 && p1.x < width + 50 && p2.x > -50 && p2.x < width + 50) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2 - 30;
            ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
            ctx.strokeStyle = `rgba(11, 143, 85, ${0.12 - scrollProgress * 0.05})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      });

      // 3. Render City Nodes & Pulsing Radar Effects
      CITIES.forEach(city => {
        const pos = project(city.lng, city.lat);
        const isSelected = city.id === selectedCity.id;

        if (pos.x >= 0 && pos.x <= width && pos.y >= 0 && pos.y <= height) {
          // Radar pulse ring
          const pulseRadius = (isSelected ? 18 : 10) + Math.sin(animTime * 3) * 6;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pulseRadius, 0, Math.PI * 2);
          ctx.fillStyle = isSelected
            ? `rgba(11, 143, 85, ${0.25 + Math.sin(animTime * 3) * 0.1})`
            : `rgba(201, 150, 47, ${0.15 + Math.sin(animTime * 2) * 0.08})`;
          ctx.fill();

          // Solid Node Dot
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, isSelected ? 7 : 4, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? '#0B8F55' : '#C9962F';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // City Label
          ctx.font = isSelected ? '600 13px Inter, sans-serif' : '500 11px Inter, sans-serif';
          ctx.fillStyle = isSelected ? '#0B8F55' : 'rgba(255, 255, 255, 0.75)';
          ctx.fillText(city.name, pos.x + 12, pos.y + 4);
        }
      });

      animationFrameId = requestAnimationFrame(renderMap);
    };

    renderMap();
    return () => cancelAnimationFrame(animationFrameId);
  }, [scrollProgress, selectedCity]);

  // ── Auto-Detect Location Handler ───────────────────────────────────────────
  const handleDetectLocation = () => {
    setIsLocating(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Simulate matching nearest city (Mumbai default for demo)
          const detected = CITIES[0];
          setSelectedCity(detected);
          setSearchQuery(detected.pin);
          setIsLocating(false);
        },
        () => {
          setIsLocating(false);
          alert('Could not detect exact GPS location. Defaulting to Mumbai (400001).');
        }
      );
    } else {
      setIsLocating(false);
    }
  };

  // ── Search Form Submit ─────────────────────────────────────────────────────
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const match = CITIES.find(
      c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.pin.includes(searchQuery)
    );
    if (match) {
      setSelectedCity(match);
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="imc-discovery-wrapper"
      style={{
        position: 'relative',
        background: '#07120E',
        color: '#FFFFFF',
        fontFamily: "'Outfit', 'Inter', sans-serif",
        padding: 'clamp(3rem, 6vw, 6rem) clamp(1.5rem, 5vw, 4rem)',
        overflow: 'hidden',
        borderTop: '1px solid rgba(11, 143, 85, 0.2)',
      }}
    >
      {/* Background Ambient Glow Orbs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: '20%',
          left: '10%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(11, 143, 85, 0.15) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '10%',
          right: '10%',
          width: '450px',
          height: '450px',
          background: 'radial-gradient(circle, rgba(201, 150, 47, 0.12) 0%, rgba(0,0,0,0) 70%)',
          filter: 'blur(60px)',
        }} />
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
        
        {/* Section Header with AOS Animation */}
        <div style={{ textAlign: 'center', maxWidth: '780px', margin: '0 auto 3.5rem auto' }}>
          
          <div 
            data-aos="fade-down"
            data-aos-duration="600"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.78rem',
              fontWeight: '700',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#0B8F55',
              background: 'rgba(11, 143, 85, 0.12)',
              padding: '0.4rem 0.95rem',
              borderRadius: '999px',
              border: '1px solid rgba(11, 143, 85, 0.3)',
              marginBottom: '1.2rem',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0B8F55', boxShadow: '0 0 10px #0B8F55' }} />
            YOUR COMMUNITY, CLOSER
          </div>

          <h2 
            data-aos="fade-up"
            data-aos-duration="800"
            style={{
              fontSize: 'clamp(2.2rem, 4.5vw, 3.8rem)',
              fontWeight: '800',
              lineHeight: 1.1,
              marginBottom: '1rem',
              textTransform: 'uppercase',
            }}
          >
            Hero India Map <span style={{ color: '#0B8F55' }}>→</span> Scroll <span style={{ color: '#C9962F' }}>→</span> Local Discovery
          </h2>

          <p 
            data-aos="fade-up"
            data-aos-delay="150"
            style={{
              fontSize: 'clamp(1rem, 1.3vw, 1.15rem)',
              color: 'rgba(255, 255, 255, 0.75)',
              lineHeight: 1.6,
            }}
          >
            As you scroll down, the nationwide India map seamlessly zooms into your local cluster — connecting you to verified members, organizations, and opportunities in your area.
          </p>
        </div>

        {/* ── Main Split View: Dynamic Map & Local Community Discovery ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '3rem',
          alignItems: 'center',
        }}>

          {/* Left Column: Interactive Zoom Canvas Map */}
          <div 
            data-aos="zoom-in"
            data-aos-duration="900"
            style={{
              position: 'relative',
              borderRadius: '16px',
              background: 'rgba(12, 26, 20, 0.75)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(11, 143, 85, 0.3)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              minHeight: '420px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            {/* Live Map Header Status Badge */}
            <div style={{
              position: 'absolute',
              top: '1.2rem',
              left: '1.2rem',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(7, 18, 14, 0.85)',
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid rgba(11, 143, 85, 0.4)',
              fontSize: '0.78rem',
              fontWeight: '700',
              color: '#0B8F55',
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0B8F55', animation: 'pulse 1.5s infinite' }} />
              Active Region: {selectedCity.name} ({selectedCity.pin})
            </div>

            {/* Interactive HTML5 Canvas Map Engine */}
            <canvas ref={canvasRef} style={{ width: '100%', height: '420px', display: 'block' }} />

            {/* Bottom Floating Stats Bar */}
            <div style={{
              position: 'absolute',
              bottom: '1rem',
              left: '1rem',
              right: '1rem',
              background: 'rgba(7, 18, 14, 0.9)',
              backdropFilter: 'blur(12px)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '0.85rem 1.2rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 10,
            }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.6)', display: 'block', textTransform: 'uppercase' }}>Verified Members</span>
                <strong style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0B8F55' }}>{selectedCity.members}</strong>
              </div>
              <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.15)' }} />
              <div>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.6)', display: 'block', textTransform: 'uppercase' }}>Active Orgs</span>
                <strong style={{ fontSize: '1.1rem', fontWeight: '800', color: '#C9962F' }}>{selectedCity.orgs}</strong>
              </div>
              <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.15)' }} />
              <div>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.6)', display: 'block', textTransform: 'uppercase' }}>Local Hubs</span>
                <strong style={{ fontSize: '1.1rem', fontWeight: '800', color: '#FFFFFF' }}>{selectedCity.hubs}</strong>
              </div>
            </div>
          </div>

          {/* Right Column: Local Community Discovery Interface */}
          <div data-aos="fade-left" data-aos-duration="800">
            
            {/* Search Card */}
            <form 
              onSubmit={handleSearchSubmit}
              style={{
                background: 'rgba(18, 38, 30, 0.6)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(11, 143, 85, 0.35)',
                borderRadius: '16px',
                padding: '1.8rem',
                boxShadow: '0 15px 40px rgba(0,0,0,0.5)',
                marginBottom: '2rem',
              }}
            >
              <label style={{ fontSize: '0.85rem', fontWeight: '700', color: 'rgba(255, 255, 255, 0.85)', marginBottom: '0.6rem', display: 'block' }}>
                🔍 Search Your City or 6-Digit PIN Code:
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.2rem' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. 400001 or Mumbai"
                  style={{
                    flex: 1,
                    background: 'rgba(7, 18, 14, 0.8)',
                    border: '1px solid rgba(11, 143, 85, 0.4)',
                    borderRadius: '8px',
                    padding: '0.8rem 1rem',
                    color: '#FFFFFF',
                    fontSize: '0.92rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />

                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={isLocating}
                  style={{
                    background: 'rgba(11, 143, 85, 0.2)',
                    border: '1px solid rgba(11, 143, 85, 0.5)',
                    color: '#0B8F55',
                    padding: '0.8rem 1rem',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  🎯 {isLocating ? 'Locating...' : 'Locate Me'}
                </button>
              </div>

              {/* Quick Select City Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {CITIES.map(city => (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => {
                      setSelectedCity(city);
                      setSearchQuery(city.pin);
                    }}
                    style={{
                      background: selectedCity.id === city.id ? '#0B8F55' : 'rgba(255, 255, 255, 0.06)',
                      color: selectedCity.id === city.id ? '#FFFFFF' : 'rgba(255, 255, 255, 0.7)',
                      border: selectedCity.id === city.id ? '1px solid #0B8F55' : '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '0.35rem 0.8rem',
                      borderRadius: '999px',
                      fontSize: '0.78rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {city.name} ({city.pin})
                  </button>
                ))}
              </div>
            </form>

            {/* Category Filters & Local Community Hub Cards */}
            <div data-aos="fade-up" data-aos-delay="200">
              <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    style={{
                      background: activeCategory === cat.id ? 'rgba(201, 150, 47, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                      color: activeCategory === cat.id ? '#C9962F' : 'rgba(255, 255, 255, 0.7)',
                      border: activeCategory === cat.id ? '1px solid #C9962F' : '1px solid rgba(255, 255, 255, 0.1)',
                      padding: '0.45rem 0.95rem',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* Discovery Local Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{
                  background: 'rgba(12, 26, 20, 0.7)',
                  border: '1px solid rgba(11, 143, 85, 0.25)',
                  padding: '1.1rem 1.4rem',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <h4 style={{ fontSize: '0.98rem', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
                      {selectedCity.name} Central Chapter & Healthcare Network
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                      PIN Code: {selectedCity.pin} • {selectedCity.members} Members Connected
                    </span>
                  </div>
                  <button style={{
                    background: '#0B8F55',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}>
                    Connect →
                  </button>
                </div>

                <div style={{
                  background: 'rgba(12, 26, 20, 0.7)',
                  border: '1px solid rgba(201, 150, 47, 0.25)',
                  padding: '1.1rem 1.4rem',
                  borderRadius: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <h4 style={{ fontSize: '0.98rem', fontWeight: '800', color: '#FFFFFF', margin: 0 }}>
                      Educational Mentorship & Youth Council
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                      {selectedCity.orgs} Registered Educational Orgs & Mentors
                    </span>
                  </div>
                  <button style={{
                    background: 'transparent',
                    color: '#C9962F',
                    border: '1px solid #C9962F',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}>
                    View Mentors
                  </button>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
