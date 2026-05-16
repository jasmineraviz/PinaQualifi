import React, { useState, useEffect } from 'react';

const App = () => {
  // --- STATES PARA SA AUTH AT UI ---
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('login'); // 'login' o 'register'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    // --- LOAD FIREBASE SCRIPTS DYNAMICALLY ---
    const loadFirebase = async () => {
      const scripts = [
        "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js",
        "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth-compat.js",
        "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"
      ];

      const loadScript = (src) => new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        document.head.appendChild(script);
      });

      for (const src of scripts) {
        if (!document.querySelector(`script[src="${src}"]`)) {
          await loadScript(src);
        }
      }

      // Firebase Configuration
      const firebaseConfig = {
        apiKey: "AIzaSyBS-2_wLRZMtRV-0cjxjfdg1WfrrvzMPz4",
        authDomain: "lpmpc-68dc5.firebaseapp.com",
        projectId: "lpmpc-68dc5",
        storageBucket: "lpmpc-68dc5.firebasestorage.app",
        messagingSenderId: "185656008375",
        appId: "1:185656008375:web:424b63a1fd1b6d011f3732"
      };

      if (window.firebase && !window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
      }
    };

    // --- LOAD BOOTSTRAP JS DYNAMICALLY (Para sa Modals) ---
    const loadBootstrapJS = () => {
      if (!document.querySelector('script[src*="bootstrap.bundle.min.js"]')) {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js";
        script.async = true;
        document.body.appendChild(script);
      }
    };

    loadFirebase();
    loadBootstrapJS();

    // --- SCROLL REVEAL LOGIC ---
    const handleScroll = () => {
      const reveals = document.querySelectorAll('.reveal');
      reveals.forEach(el => {
        const windowHeight = window.innerHeight;
        const elementTop = el.getBoundingClientRect().top;
        if (elementTop < windowHeight - 150) {
          el.classList.add('active');
        }
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --- FIREBASE FUNCTIONS ---
  const registerUser = async (e) => {
    if(e) e.preventDefault();
    if (!email || !password) {
        alert("Please fill in email and password");
        return;
    }
    setLoading(true);
    try {
      const auth = window.firebase.auth();
      const db = window.firebase.firestore();
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      await db.doc(`artifacts/${appId}/users/${userCredential.user.uid}/profile`).set({
        fullName,
        email,
        contactNo: contact,
        address,
        role: "customer",
        createdAt: new Date().toISOString()
      });
      alert("Account Created!");
      window.location.reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loginUser = async (e) => {
    if(e) e.preventDefault();
    if (!email || !password) {
        alert("Please fill in email and password");
        return;
    }
    setLoading(true);
    try {
      const auth = window.firebase.auth();
      const db = window.firebase.firestore();
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      const userDoc = await db.doc(`artifacts/${appId}/users/${userCredential.user.uid}/profile`).get();

      if (userDoc.exists && userDoc.data().role === "admin") {
        alert("Welcome Admin!");
      } else {
        alert("Login Successful!");
      }
      window.location.reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lpmpc-container">
      {/* External Resources */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Playfair+Display:wght@700&display=swap');

        :root {
            --lpmpc-green: #468432;
            --lpmpc-gold: #ffd700;
            --lpmpc-light-yellow: #FFEF91;
            --text-dark: #1e1e24;
        }

        header { position: fixed; top: 0; width: 100%; z-index: 1000; }

        .reveal { opacity: 0; transition: all 1.2s cubic-bezier(0.17, 0.85, 0.438, 1); }
        .reveal-left { transform: translateX(-80px); }
        .reveal-right { transform: translateX(80px); }
        .reveal-up { transform: translateY(50px); }
        .reveal.active { opacity: 1; transform: translate(0, 0); }

        #about { background-color: var(--lpmpc-light-yellow) !important; }

        main { margin-top: 70px; }
        html, body { margin: 0; padding: 0; width: 100%; overflow-x: hidden; }

        body {
            font-family: 'Montserrat', sans-serif;
            color: var(--text-dark);
            background-color: #ffffff;
        }

        section { padding: 80px 0; }
        h1, h2, h3, .navbar-brand { font-family: 'Playfair Display', serif; }

        .navbar {
            background-color: var(--lpmpc-green) !important;
            border-bottom: 4px solid var(--lpmpc-gold);
            width: 100%;
        }

        .navbar-toggler { border-color: rgba(255, 255, 255, 0.5) !important; }
        .navbar-toggler-icon { filter: invert(1); }

        .nav-link { color: #ffffff !important; transition: 0.3s; }
        .nav-link:hover { color: var(--lpmpc-light-yellow) !important; }

        .home-section {
            background-color: var(--lpmpc-light-yellow);
            padding: 120px 0;
            clip-path: ellipse(150% 100% at 50% 0%);
            text-align: center;
        }

        .card {
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            border: 1px solid #eee !important;
            border-radius: 15px;
            overflow: hidden;
        }

        .card:hover {
            transform: translateY(-12px);
            box-shadow: 0 15px 30px rgba(0,0,0,0.1) !important;
        }

        .btn-custom-green {
            background-color: var(--lpmpc-green);
            color: white;
            border-radius: 8px;
            font-weight: bold;
            padding: 12px;
            border: none;
        }

        .btn-outline-login_signup {
            color: white;
            border: 2px solid var(--lpmpc-gold);
            background: transparent;
        }

        .contact-info-card {
            background: #fdfdfd;
            border-left: 5px solid var(--lpmpc-green) !important;
        }

        .farmer-notice {
            background-color: #f1f8ee;
            border: 1px dashed var(--lpmpc-green);
        }

        .lpmpc-green { color: var(--lpmpc-green) !important; }

        footer {
            background-color: var(--lpmpc-green);
            color: white;
            padding: 40px 0;
        }

        @media (max-width: 991.98px) {
            .navbar-collapse {
                background-color: var(--lpmpc-green);
                padding: 1rem;
                border-radius: 0 0 15px 15px;
                margin-top: 10px;
                border: 1px solid var(--lpmpc-gold);
            }
        }
    // 1. Add this to your <style> tag

      /* Modern Auth Styles */
      .auth-modal-content {
        border-radius: 20px;
        overflow: hidden;
        border: none;
      }

      .auth-side-panel {
        background: linear-gradient(135deg, var(--lpmpc-green) 0%, #2d5a1e 100%);
        color: white;
        padding: 40px;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .form-floating > .form-control:focus {
        border-color: var(--lpmpc-green);
        box-shadow: 0 0 0 0.25rem rgba(70, 132, 50, 0.15);
      }

      .auth-toggle-btn {
        color: var(--lpmpc-green);
        text-decoration: none;
        font-weight: 600;
        transition: 0.2s;
        cursor: pointer;
      }

      .auth-toggle-btn:hover {
        color: var(--lpmpc-gold);
      }

      .input-group-text {
        background: transparent;
        border-left: none;
        cursor: pointer;
      }

      .password-input {
        border-right: none;
      }

      `}</style>

      {/* HEADER */}
      <header className="shadow-sm">
        <nav className="navbar navbar-expand-lg navbar-dark">
          <div className="container-fluid">
            <a className="navbar-brand d-flex align-items-center" href="#">
              <img src="/logo.png" alt="LPMPC Logo" width="40" height="40" className="rounded-circle me-2 bg-white" />
              <span className="fw-bold">LPMPC Market Hub</span>
            </a>
            <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
              <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="navbarNav">
              <div className="navbar-nav ms-auto align-items-center">
                <a className="nav-link" href="#products">Products</a>
                <a className="nav-link" href="#about">About Us</a>
                <a className="nav-link" href="#contact">Contact</a>
                <button className="btn btn-outline-login_signup rounded-pill px-4 ms-lg-3 mt-2 mt-lg-0" data-bs-toggle="modal" data-bs-target="#signupModal">
                  Log In / Sign Up
                </button>
              </div>
            </div>
          </div>
        </nav>
      </header>

      <main>
        {/* INTRO */}
        <section id="home" className="home-section">
          <div className="container">
            <h2 className="display-5 fw-bold lpmpc-green">Buy high-quality fabrics and cloths made of Queen Pineapple Fiber.</h2>
          </div>
        </section>

        {/* PRODUCTS SECTION */}
        <section id="products" className="container my-5">
          <h2 className="display-5 text-center mb-5 fw-bold lpmpc-green">Our Products</h2>
          <div className="row g-4 text-start">
            {[
              { title: "Piña Alampay", img: "/alampay.jpg", desc: "Experience the Queen of Philippine Fabrics with our handcrafted Piña Alampay. Woven from premium, hand-scraped pineapple fibers." },
              { title: "Barong", img: "/barong.jpg", desc: "Hand-scraped pineapple fibers woven into a premier choice for graduates and formal events." },
              { title: "Piña Cloth", img: "/pinacloth.jpg", desc: "Dignified and elegant alternative to traditional stoles, handcrafted by the cooperative." }
            ].map((p, i) => (
              <div key={i} className="col-12 col-md-6 col-lg-4">
                <div className="card h-100">
                  <img src={p.img} className="card-img-top" alt={p.title} style={{height: '250px', objectFit: 'cover'}} />
                  <div className="card-body d-flex flex-column p-4">
                    <h3 className="h4 fw-bold">{p.title}</h3>
                    <p className="text-muted small">{p.desc}</p>
                    <button className="btn btn-custom-green mt-auto" data-bs-toggle="modal" data-bs-target="#signupModal">Order Now!</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ABOUT US SECTION */}
        <section id="about" className="reveal py-5">
          <div className="container text-start">
            <h2 className="display-5 mb-5 fw-bold lpmpc-green">About Us</h2>
            <div className="row align-items-center g-5">
              <div className="col-lg-6 reveal reveal-left">
                <p>Labo Progressive Multi-Purpose Cooperative (LPMPC) is an agricultural cooperative that produces natural pineapple products like juice drink, dried fruit, fiber, and cloth.</p>
                <p>We are dedicated to uplifting local farmers by transforming Queen Pineapple leaves into world-class sustainable textiles through traditional craftsmanship.</p>
              </div>
              <div className="col-lg-6 reveal reveal-right">
                <img src="/lpmpc.jpg" className="img-fluid rounded shadow-lg w-100" alt="About Us Image" style={{maxHeight: '400px', objectFit: 'cover'}} />
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT SECTION */}
        <section id="contact" className="reveal container my-5 py-5">
          <div className="text-center mb-5 reveal reveal-up">
            <h2 className="display-5 fw-bold lpmpc-green">Get in Touch</h2>
            <p className="lead text-muted">Have questions about our Queen Pineapple products or our cooperative?</p>
          </div>
          <div className="row g-5 text-start">
            <div className="col-lg-5 reveal reveal-up">
              <div className="card border-0 shadow-sm h-100 p-4 contact-info-card">
                <h3 className="h4 mb-4">Contact Information</h3>
                <div className="d-flex mb-3 align-items-center">
                  <span className="material-symbols-outlined me-3 lpmpc-green">location_on</span>
                  <p className="text-muted mb-0 small">Labo Progressive Multi-Purpose Cooperative<br />Purok 2 Malasugui, Labo, Philippines, 4604</p>
                </div>
                <div className="d-flex mb-3 align-items-center">
                  <span className="material-symbols-outlined me-3 lpmpc-green">mail</span>
                  <p className="text-muted mb-0 small">laboprogressive@gmail.com</p>
                </div>
                <div className="d-flex mb-4 align-items-center">
                  <span className="material-symbols-outlined me-3 lpmpc-green">call</span>
                  <p className="text-muted mb-0 small">+63 985 440 119</p>
                </div>
                <div className="p-3 rounded farmer-notice">
                  <h6 className="fw-bold lpmpc-green">For Farmers & Providers</h6>
                  <p className="small mb-0 text-muted">Interested in supplying Queen Pineapple fiber? Please visit our main office or call us to set up your official Provider Account.</p>
                </div>
              </div>
            </div>
            <div className="col-lg-7 reveal reveal-up">
              <div className="card border-0 shadow-sm p-4 h-100">
                <h3 className="h4 mb-4">Send us a Message</h3>
                <form onSubmit={(e) => e.preventDefault()}>
                  <div className="row g-3">
                    <div className="col-md-6"><label className="small fw-bold">Your Name</label><input type="text" className="form-control" /></div>
                    <div className="col-md-6"><label className="small fw-bold">Email Address</label><input type="email" className="form-control" /></div>
                    <div className="col-12">
                      <label className="small fw-bold">Subject</label>
                      <select className="form-select">
                        <option>General Inquiry</option>
                        <option>Product Order Inquiry</option>
                        <option>Farmer Partnership</option>
                        <option>Feedback</option>
                      </select>
                    </div>
                    <div className="col-12"><label className="small fw-bold">Message</label><textarea className="form-control" rows="5"></textarea></div>
                    <div className="col-12"><button type="submit" className="btn btn-custom-green w-100 py-3">Send Message</button></div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* POPUP AUTH */}
      <div className="modal fade" id="signupModal" tabIndex="-1" aria-hidden="true">
        <div className="modal-dialog modal-dialog-centered modal-xl">
          <div className="modal-content auth-modal-content shadow-lg">
            <div className="row g-0">

              {/* Left Side: Visual/Branding (Hidden on mobile) */}
              <div className="col-lg-5 d-none d-lg-flex auth-side-panel text-center">
                <div className="mb-4">
                  <img src="/logo.png" alt="Logo" width="100" className="rounded-circle bg-white p-2 mb-3 shadow" />
                  <h2 className="display-6 fw-bold">Queen Pineapple Marketplace</h2>
                  <p className="opacity-75">Connecting you to the finest handcrafted heritage fabrics of Labo.</p>
                </div>
                <div className="mt-4 pt-4 border-top border-white border-opacity-25">
                  <small>Support Local Farmers • Sustainable Fashion • Premium Quality</small>
                </div>
              </div>

              {/* Right Side: Form */}
              <div className="col-lg-7 p-4 p-md-5 bg-white position-relative">
                {/* Absolute positioned close button for a cleaner header */}
                <button
                  type="button"
                  className="btn-close position-absolute"
                  style={{ top: '2rem', right: '2rem' }}
                  data-bs-dismiss="modal"
                  aria-label="Close"
                ></button>

                <div className="mb-5">
                  <h2 className="fw-bold mb-2" style={{ fontFamily: "'Playfair Display', serif", color: '#1e1e24' }}>
                    {view === 'login' ? 'Welcome Back' : 'Create Account'}
                  </h2>
                  <p className="text-muted" style={{ fontSize: '0.95rem', maxWidth: '90%' }}>
                    {view === 'login'
                      ? 'Please enter your details to login and access your account.'
                      : 'Join our community to shop for handcrafted Queen Pineapple fabrics and track your orders.'}
                  </p>
                </div>

                <form onSubmit={view === 'login' ? loginUser : registerUser}>
                  <div className="row g-3">
                    {/* Registration Fields */}
                    {view === 'register' && (
                      <div className="col-12">
                        <div className="form-floating mb-2">
                          <input type="text" className="form-control rounded-3" id="regName" placeholder="Full Name"
                            value={fullName} onChange={(e)=>setFullName(e.target.value)} required />
                          <label htmlFor="regName">Full Name</label>
                        </div>
                      </div>
                    )}

                    {/* Email Field */}
                    <div className="col-12">
                      <div className="form-floating mb-2">
                        <input type="email" className="form-control rounded-3" id="authEmail" placeholder="name@example.com"
                          value={email} onChange={(e)=>setEmail(e.target.value)} required />
                        <label htmlFor="authEmail">Email Address</label>
                      </div>
                    </div>

                    {/* Password Field */}
                    <div className="col-12">
                      <div className="form-floating mb-2">
                        <input type="password" className="form-control rounded-3" id="authPass" placeholder="Password"
                          value={password} onChange={(e)=>setPassword(e.target.value)} required />
                        <label htmlFor="authPass">Password</label>
                      </div>
                    </div>

                    {view === 'register' && (
                      <>
                        <div className="col-md-6">
                          <div className="form-floating mb-2">
                            <input type="text" className="form-control rounded-3" id="regContact" placeholder="Phone"
                              value={contact} onChange={(e)=>setContact(e.target.value)} required />
                            <label htmlFor="regContact">Phone Number</label>
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-floating mb-2">
                            <input type="text" className="form-control rounded-3" id="regAddress" placeholder="Address"
                              value={address} onChange={(e)=>setAddress(e.target.value)} required />
                            <label htmlFor="regAddress">Complete Address</label>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="d-grid gap-2 mt-4">
                    <button type="submit" className="btn btn-custom-green py-3 fw-bold shadow-sm border-0" disabled={loading}>
                      {loading ? (
                        <span className="spinner-border spinner-border-sm"></span>
                      ) : (view === 'login' ? 'Log In' : 'Register Now')}
                    </button>
                  </div>

                  <div className="text-center mt-4">
                    <p className="text-muted small">
                      {view === 'login' ? "Don't have an account?" : "Already have an account?"}
                      <span
                        className="auth-toggle-btn ms-2"
                        style={{ cursor: 'pointer', color: 'var(--lpmpc-green)', fontWeight: '700' }}
                        onClick={() => setView(view === 'login' ? 'register' : 'login')}
                      >
                        {view === 'login' ? 'Sign Up Here' : 'Log In Here'}
                      </span>
                    </p>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="text-center">
        <div className="container">
          <p className="mb-0 text-white">&copy; 2026 LPMPC Market Hub. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;