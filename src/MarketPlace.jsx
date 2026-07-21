import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

const supabaseUrl = 'https://bqblzvgwkvdkanobntgn.supabase.co';
const supabaseKey = 'sb_publishable_cKKlFv0eCaArfywT-fqzaQ_QEXrLLbm';
const supabase = createClient(supabaseUrl, supabaseKey);

const App = () => {
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [contact, setContact] = useState('');
    const [address, setAddress] = useState('');
    const [user, setUser] = useState(null);

    // CONTACT FORM STATES
    const [msgName, setMsgName] = useState('');
    const [msgEmail, setMsgEmail] = useState('');
    const [msgSubject, setMsgSubject] = useState('General Inquiry');
    const [msgText, setMsgText] = useState('');
    const [isSendingMsg, setIsSendingMsg] = useState(false);

    // BASE FIBER UNIT PRICE
    const PRICE_PER_KG = 650;

    // DECORTICATED FIBER PRODUCTS (PNS/BAFS 318:2021)
    const fiberProducts = [
        { grade: "PID-1", title: "PID-1", img: "/pinacloth.jpg", desc: "Premium grade decorticated Queen Pineapple fiber with superior luster and high tensile strength." },
        { grade: "PID-2", title: "PID-2", img: "/pinacloth.jpg", desc: "Selected grade decorticated fiber suitable for fine blending, crafts, and high-grade composites." },
        { grade: "PID-3", title: "PID-3", img: "/pinacloth.jpg", desc: "Standard commercial grade decorticated fiber used for twines, ropes, and industrial applications." },
        { grade: "PID-4", title: "PID-4", img: "/pinacloth.jpg", desc: "Residual decorticated fiber utilized for pulp, heavy reinforcement, and eco-composites." }
    ];

    // PRODUCT AND ORDER STATES
    const [selectedProduct, setSelectedProduct] = useState(fiberProducts[0]);
    const [weightKg, setWeightKg] = useState(1); // Default 1 kg order
    const [orderNotes, setOrderNotes] = useState('');

    // LIVE ORDER HISTORY STATES
    const [customerOrders, setCustomerOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [isOrdersLoading, setIsOrdersLoading] = useState(false);

    // CALCULATIONS FOR BULK WEIGHT AT ₱650/KG
    const finalTotal = (Number(weightKg) || 1) * PRICE_PER_KG;

    // FETCH REAL-TIME CLIENT ORDERS
    const fetchCustomerOrderHistory = async (nameFilter) => {
        if (!nameFilter) return;
        try {
            setIsOrdersLoading(true);
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    *,
                    order_items (*)
                `)
                .eq('customer_name', nameFilter)
                .order('created_at', { ascending: false });

            if (error) throw error;

            setCustomerOrders(data || []);
            if (data && data.length > 0) {
                setSelectedOrder(prev => {
                    if (!prev) return data[0];
                    const updated = data.find(o => o.id === prev.id);
                    return updated || data[0];
                });
            } else {
                setSelectedOrder(null);
            }
        } catch (error) {
            console.error('Error fetching customer historical data:', error.message);
        } finally {
            setIsOrdersLoading(false);
        }
    };

    // REALTIME CUSTOMER FEED SYNC ACTION
    useEffect(() => {
        if (!fullName) return;

        fetchCustomerOrderHistory(fullName);

        const channel = supabase
            .channel('customer-orders-global-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                (payload) => {
                    if (payload.new && payload.new.customer_name === fullName) {
                        console.log("Live update caught for this customer!", payload);
                        fetchCustomerOrderHistory(fullName);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fullName]);

    // HANDLER FOR SENDING CONTACT MESSAGES (ONLY SAVES TO SUPABASE DATABASE)
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!msgName || !msgEmail || !msgText) {
            alert("Please fill in all required message fields.");
            return;
        }

        setIsSendingMsg(true);
        try {
            // Save directly to Supabase table (No EmailJS triggered)
            const { error: dbError } = await supabase
                .from('messages')
                .insert([{
                    sender_name: msgName,
                    sender_email: msgEmail,
                    subject: msgSubject,
                    message: msgText,
                    status: 'Unread'
                }]);

            if (dbError) throw dbError;

            alert("Your message has been sent successfully! LPMPC Admin will review it in their dashboard.");
            setMsgName('');
            setMsgEmail('');
            setMsgSubject('General Inquiry');
            setMsgText('');
        } catch (error) {
            console.error('Error sending message:', error.message);
            alert("Failed to send message: " + error.message);
        } finally {
            setIsSendingMsg(false);
        }
    };

    // HANDLERS
    const handlePlaceOrder = async () => {
        try {
            const currentCustomerName = fullName || "Anonymous Guest";
            const shippingMethodEl = document.getElementById('shippingMethod');
            const deliveryMethodVal = shippingMethodEl ? shippingMethodEl.value : 'Standard Cargo Shipping';

            const { data: parentOrder, error: parentError } = await supabase
                .from('orders')
                .insert([{
                    customer_name: currentCustomerName,
                    delivery_method: deliveryMethodVal,
                    total_amount: finalTotal,
                    contact_no: contact,
                    shipping_address: address,
                    order_status: 'Pending'
                }])
                .select()
                .single();

            if (parentError) throw parentError;

            const orderItemsData = [{
                order_id: parentOrder.id,
                item_name: selectedProduct.title,
                fiber_type: selectedProduct.grade,
                fiber_weight: Number(weightKg),
                unit_price: PRICE_PER_KG,
                measurements: {
                    weight_kg: Number(weightKg),
                    price_per_kg: PRICE_PER_KG,
                    notes: orderNotes
                }
            }];

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItemsData);

            if (itemsError) throw itemsError;

            alert("Order successfully saved to Piña-QualiFi database!");

            const modalEl = document.getElementById('orderModal');
            if (modalEl) {
                const modal = window.bootstrap?.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

        } catch (error) {
            console.error('Database Error:', error.message);
            alert("Error saving order. Check console.");
        }
    };

    useEffect(() => {
        const handleScroll = () => {
            const reveals = document.querySelectorAll('.reveal');
            reveals.forEach(el => {
                if (el.getBoundingClientRect().top < window.innerHeight - 150) {
                    el.classList.add('active');
                }
            });
        };

        const loadBootstrapJS = () => {
            if (!document.querySelector('script[src*="bootstrap.bundle.min.js"]')) {
                const script = document.createElement('script');
                script.src = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js";
                script.async = true;
                document.body.appendChild(script);
            }
        };

        loadBootstrapJS();
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navigate = useNavigate();

    const registerUser = async (e) => {
        if (e) e.preventDefault();
        setLoading(true);
        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
            });
            if (authError) throw authError;

            if (authData.user) {
                const { error: dbError } = await supabase
                    .from('users')
                    .insert([{
                        id: authData.user.id,
                        full_name: fullName,
                        email: email,
                        contact_no: contact,
                        address: address,
                        role: "customer"
                    }]);

                if (dbError) throw dbError;
                alert("Account Created!");
            }

            const modalEl = document.getElementById('signupModal');
            const modal = window.bootstrap?.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loginUser = async (e) => {
        if (e) e.preventDefault();
        setLoading(true);
        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (authError) throw authError;

            const { data: profile, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('id', authData.user.id)
                .single();

            if (dbError) throw dbError;

            setUser(profile);
            setFullName(profile.full_name);
            setContact(profile.contact_no);
            setAddress(profile.address);

            if (profile.role === "admin") {
                alert("Welcome, System Admin!");
                navigate('/admin');
            } else if (profile.role === "farmer") {
                alert("Welcome, Partner Farmer!");
                navigate('/farmer');
            } else {
                alert("Login Successful!");
            }

            const modalEl = document.getElementById('signupModal');
            const modal = window.bootstrap?.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

  return (

    <div className="lpmpc-container">

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

                   {/* NAVIGATION BARS */}

                  <div className="collapse navbar-collapse" id="navbarNav">
                      <div className="navbar-nav ms-auto align-items-center">
                          <div className="navbar-nav ms-auto align-items-center">
                              <a className="nav-link" href="#products">Classified Fibers</a>
                              <a className="nav-link" href="#about">About Us</a>
                              <a className="nav-link" href="#contact">Contact</a>

                              {!user ? (
                                  <button className="btn btn-outline-login_signup rounded-pill px-4 ms-lg-3 mt-2 mt-lg-0" data-bs-toggle="modal" data-bs-target="#signupModal">Log In / Sign Up</button>
                              ) : (

                                  <div className="nav-item dropdown ms-lg-3">
                                      <a className="nav-link dropdown-toggle d-flex align-items-center bg-white bg-opacity-10 rounded-pill px-3" href="#" role="button" data-bs-toggle="dropdown">
                                          <span className="material-symbols-outlined me-2">account_circle</span>
                                          <span className="small fw-bold text-uppercase">{fullName}</span>
                                      </a>
                                      <ul className="dropdown-menu dropdown-menu-end shadow border-0 mt-2">
                                          <li>
                                              <a className="dropdown-item py-2 small fw-bold" href="#" data-bs-toggle="modal" data-bs-target="#ordersModal">
                                                  <span className="material-symbols-outlined align-middle me-2">inventory_2</span> My Order History
                                              </a>
                                          </li>
                                          <li><hr className="dropdown-divider" /></li>
                                          <li><a className="dropdown-item py-2 small fw-bold text-danger" href="#" onClick={() => setUser(null)}><span className="material-symbols-outlined align-middle me-2">logout</span> Logout</a></li>
                                      </ul>
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          </nav>
      </header>

      <main>

          {/* INTRO */}
          <section id="home" className="home-section">
              <div className="container">
                  <h2 className="display-5 fw-bold lpmpc-green">Buy high-quality, PNS-graded decorticated Queen Pineapple Fibers.</h2>
              </div>
          </section>

          {/* PRODUCTS SECTION */}
          <section id="products" className="container my-5">
              <div className="mb-5">

                <h2 className="display-5 text-center fw-bold lpmpc-green">Classified Decorticated Fibers</h2>
                <p className="text-center text-muted">Standardized baseline rate: <strong>₱650.00 / kg</strong></p>

                {/* BULK ORDER REQUEST BUTTON */}
                <div className="d-flex justify-content-end mt-3">
                    <button
                        className="btn btn-outline-success px-4 py-2 rounded-pill fw-bold shadow-sm d-flex align-items-center"
                        data-bs-toggle="modal"
                        data-bs-target={user ? "#orderModal" : "#signupModal"}
                        onClick={() => {
                            setSelectedProduct(fiberProducts[0]);
                            setWeightKg(1);
                        }}
                      >

                        <span className="material-symbols-outlined me-2" style={{fontSize: '1.2rem'}}>scale</span>Purchase Bulk Fiber Batch
                    </button>
                </div>
              </div>

              <div className="row g-4 text-start">
                  {fiberProducts.map((p, i) => (
                      <div key={i} className="col-12 col-md-6 col-lg-3">
                          <div className="card h-100 border-0 shadow-sm rounded-4 overflow-hidden">
                              <img src={p.img} className="card-img-top" alt={p.title} style={{height: '220px', objectFit: 'cover'}} />

                              <div className="card-body d-flex flex-column p-4">
                                  <h3 className="h5 fw-bold mb-1">{p.title}</h3>
                                  <p className="text-success fw-bold fs-5 mb-2">₱650.00 <span className="fs-6 text-muted fw-normal">/ kg</span></p>
                                  <p className="text-muted small flex-grow-1">{p.desc}</p>

                                  {/* STANDARD ORDER BUTTON */}
                                  <button
                                    className="btn btn-custom-green w-100 mt-3 py-2 fw-bold"
                                    data-bs-toggle="modal"
                                    data-bs-target={user ? "#orderModal" : "#signupModal"}
                                    onClick={() => {
                                        setSelectedProduct(p);
                                        setWeightKg(1);
                                    }}
                                  >
                                    {user ? 'Select Fiber Grade' : 'Order Now!'}
                                  </button>
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
                          <p>We are dedicated to uplifting local farmers by transforming Queen Pineapple leaves into world-class sustainable materials through automated quality grading.</p>
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
                  <p className="lead text-muted">Have questions about our Queen Pineapple fiber grades or our cooperative?</p>
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
                          <form onSubmit={handleSendMessage}>
                              <div className="row g-3">
                                  <div className="col-md-6">
                                      <label className="small fw-bold">Your Name</label>
                                      <input type="text" className="form-control" value={msgName} onChange={(e) => setMsgName(e.target.value)} required />
                                  </div>
                                  <div className="col-md-6">
                                      <label className="small fw-bold">Email Address</label>
                                      <input type="email" className="form-control" value={msgEmail} onChange={(e) => setMsgEmail(e.target.value)} required />
                                  </div>
                                  <div className="col-12">
                                      <label className="small fw-bold">Subject</label>
                                      <select className="form-select" value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)}>
                                          <option value="General Inquiry">General Inquiry</option>
                                          <option value="Product Order Inquiry">Product Order Inquiry</option>
                                          <option value="Farmer Partnership">Farmer Partnership</option>
                                          <option value="Feedback">Feedback</option>
                                      </select>
                                  </div>
                                  <div className="col-12">
                                      <label className="small fw-bold">Message</label>
                                      <textarea className="form-control" rows="5" value={msgText} onChange={(e) => setMsgText(e.target.value)} required></textarea>
                                  </div>
                                  <div className="col-12">
                                      <button type="submit" className="btn btn-custom-green w-100 py-3 fw-bold" disabled={isSendingMsg}>
                                          {isSendingMsg ? <span className="spinner-border spinner-border-sm me-2"></span> : 'Send Message'}
                                      </button>
                                  </div>
                             </div>
                          </form>
                      </div>
                  </div>
              </div>
          </section>
      </main>

      {/* ORDER SELECTION MODAL */}
      <div className="modal fade" id="orderModal" tabIndex="-1" aria-hidden="true">
          <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="p-4 text-white" style={{ background: 'var(--lpmpc-green)' }}>
                      <div className="d-flex justify-content-between align-items-center">
                          <div>
                              <h5 className="fw-bold m-0 text-uppercase small" style={{opacity: 0.8}}>Confirm Fiber Order</h5>
                              <h4 className="fw-bold m-0">{selectedProduct.title}</h4>
                          </div>
                          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                      </div>
                  </div>

                  <div className="modal-body p-4 bg-white">

                     {/* BULK WEIGHT SELECTOR */}
                     <div className="reveal active mb-4">
                         <div className="card border-0 bg-light p-4 rounded-4">
                             <div className="row align-items-center">
                                 <div className="col-md-6 mb-3 mb-md-0">
                                     <label className="fw-bold text-dark mb-1 d-block">Weight in Kilograms (kg):</label>
                                     <div className="input-group">
                                         <button className="btn btn-outline-success" type="button" onClick={() => setWeightKg(prev => Math.max(0.5, prev - 0.5))}>-</button>
                                         <input
                                             type="number"
                                             className="form-control text-center fw-bold border-success"
                                             value={weightKg}
                                             min="0.5"
                                             step="0.5"
                                             onChange={(e) => setWeightKg(Math.max(0.5, Number(e.target.value)))}
                                         />
                                         <span className="input-group-text fw-bold text-success bg-white border-success">kg</span>
                                         <button className="btn btn-outline-success" type="button" onClick={() => setWeightKg(prev => prev + 0.5)}>+</button>
                                     </div>
                                 </div>
                                 <div className="col-md-6 text-md-end">
                                     <span className="small text-muted d-block">Unit Rate: ₱650.00 / kg</span>
                                     <span className="h4 fw-bold text-success mb-0">Subtotal: ₱{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                 </div>
                             </div>
                         </div>

                         <div className="mt-3">
                             <label className="fw-bold small text-muted text-uppercase mb-1">Processing Notes / Instructions</label>
                             <textarea className="form-control rounded-3" rows="3" placeholder="Specific packaging requests or logistics requirements..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} style={{fontSize: '0.85rem'}}></textarea>
                         </div>
                     </div>

                  {/* SHIPPING DETAILS SECTION */}
                  <div className="mt-4 border-top pt-4">
                      <h6 className="fw-bold small text-muted text-uppercase mb-3 d-flex align-items-center">
                          <span className="material-symbols-outlined me-2" style={{fontSize: '1.2rem'}}>local_shipping</span>
                          Shipping Details
                      </h6>
                      <div className="row g-3">
                          <div className="col-md-6">
                              <div className="form-floating">
                                  <input
                                      type="text"
                                      className="form-control rounded-3 border-success"
                                      id="shippingContact"
                                      placeholder="Contact Number"
                                      value={contact}
                                      onChange={(e) => setContact(e.target.value)}
                                  />
                                  <label className="small">Recipient Contact Number</label>
                              </div>
                          </div>
                          <div className="col-md-6">
                              <div className="form-floating">
                                  <select className="form-select border-success" id="shippingMethod">
                                      <option value="standard">Standard Cargo (3-5 days)</option>
                                      <option value="express">Express Delivery (1-2 days)</option>
                                      <option value="pickup">Store Pickup (Labo, CN)</option>
                                  </select>
                                  <label className="small">Delivery Method</label>
                              </div>
                          </div>
                          <div className="col-12">
                              <div className="form-floating">
                                  <textarea
                                      className="form-control rounded-3 border-success"
                                      placeholder="Full Shipping Address"
                                      id="shippingAddress"
                                      style={{height: '80px'}}
                                      value={address}
                                      onChange={(e) => setAddress(e.target.value)}
                                  ></textarea>
                                  <label className="small">Full Shipping Address</label>
                              </div>
                              <div className="form-check mt-2">
                                  <input className="form-check-input" type="checkbox" id="saveDefault" defaultChecked />
                                  <label className="form-check-label small text-muted" htmlFor="saveDefault">
                                      Use my profile address as default
                                  </label>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* IMPORTANT REMINDERS NOTE */}
                  <div className="mt-4 p-3 rounded-4 bg-light border-start border-4 border-warning">
                      <div className="d-flex">
                          <span className="material-symbols-outlined text-warning me-2" style={{fontSize: '1.4rem'}}>info</span>
                          <div>
                              <h6 className="fw-bold mb-1 small text-dark">Important Notes:</h6>
                              <ul className="mb-0 text-muted" style={{ fontSize: '0.75rem', paddingLeft: '1.2rem' }}>
                                  <li className="mb-1">
                                      <strong>Inventory Verification:</strong> All orders are subject to live stock availability. If warehouse stock is insufficient, the system will check local farm harvest predictions for leaf sourcing.
                                  </li>
                                  <li>
                                      <strong>Automated Rejection:</strong> If neither warehouse inventory nor local farms can cover the requested volume, the order will be automatically rejected.
                                  </li>
                              </ul>
                          </div>
                      </div>
                  </div>

                      {/* SUMMARY & CHECKOUT */}
                      <div className="mt-4 p-4 order-summary-bar d-flex justify-content-between align-items-center shadow">
                          <div>
                              <p className="m-0 small text-uppercase fw-bold" style={{opacity: 0.8}}>Total Price</p>
                              <h2
                                className="fw-bold m-0"
                                style={{ color: 'var(--lpmpc-green)' }}
                              >
                                ₱{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </h2>
                          </div>
                          <button
                              className="btn px-5 py-3 rounded-pill text-uppercase shadow-sm fw-bold"
                              style={{
                                  backgroundColor: '#ffd700',
                                  color: '#468432',
                                  border: 'none'
                              }}
                              onClick={handlePlaceOrder}
                          >
                              Place Order Now
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* POPUP AUTH */}
      <div className="modal fade" id="signupModal" tabIndex="-1" aria-hidden="true">
          <div className="modal-dialog modal-dialog-centered modal-xl">
              <div className="modal-content auth-modal-content shadow-lg">
                  <div className="row g-0">

                      <div className="col-lg-5 d-none d-lg-flex auth-side-panel text-center">
                          <div className="mb-4">
                              <img src="/logo.png" alt="Logo" width="100" className="rounded-circle bg-white p-2 mb-3 shadow" />
                              <h2 className="display-6 fw-bold">Queen Pineapple Marketplace</h2>
                              <p className="opacity-75">Connecting you to PNS-certified decorticated fibers of Labo.</p>
                          </div>

                          <div className="mt-4 pt-4 border-top border-white border-opacity-25">
                              <small>Support Local Farmers • Standardized Grading • Premium Quality</small>
                          </div>
                      </div>

                      <div className="col-lg-7 p-4 p-md-5 bg-white position-relative">
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
                              : 'Join our community to shop for certified Queen Pineapple decorticated fibers.'}
                          </p>
                      </div>

                      <form onSubmit={view === 'login' ? loginUser : registerUser}>
                          <div className="row g-3">
                              {/* Registration Fields */}
                              {view === 'register' && (
                                  <div className="col-12">
                                      <div className="form-floating mb-2">
                                          <input type="text" className="form-control rounded-3" id="regName" placeholder="Full Name"value={fullName} onChange={(e)=>setFullName(e.target.value)} required /> <label htmlFor="regName">Full Name</label>
                                      </div>
                                  </div>
                              )}

                             {/* Email Field */}
                             <div className="col-12">
                                 <div className="form-floating mb-2">
                                     <input type="email" className="form-control rounded-3" id="authEmail" placeholder="name@example.com"value={email} onChange={(e)=>setEmail(e.target.value)} required /> <label htmlFor="authEmail">Email Address</label>
                                </div>
                             </div>

                            {/* Password Field */}
                            <div className="col-12">
                                <div className="form-floating mb-2">
                                    <input type="password" className="form-control rounded-3" id="authPass" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} required /> <label htmlFor="authPass">Password</label>
                                </div>
                            </div>

                            {view === 'register' && (
                                <>
                                 <div className="col-md-6">
                                     <div className="form-floating mb-2">
                                         <input type="text" className="form-control rounded-3" id="regContact" placeholder="Phone" value={contact} onChange={(e)=>setContact(e.target.value)} required /> <label htmlFor="regContact">Phone Number</label> </div>
                                     </div>
                                <div className="col-md-6">
                                    <div className="form-floating mb-2">
                                        <input type="text" className="form-control rounded-3" id="regAddress" placeholder="Address" value={address} onChange={(e)=>setAddress(e.target.value)} required /> <label htmlFor="regAddress">Complete Address</label>
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

    {/* ALL ORDERS MODAL */}
        <div className="modal fade" id="ordersModal" tabIndex="-1" aria-hidden="true">
            <div className="modal-dialog modal-dialog-centered modal-xl">
                <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                    <div className="modal-header bg-lpmpc-green text-white p-4">
                        <h5 className="modal-title fw-bold d-flex align-items-center">
                            <span className="material-symbols-outlined me-2">shopping_bag</span>
                            Your Order History
                        </h5>
                        <button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div className="modal-body p-0 bg-light">
                        <div className="row g-0">

                            {/* LEFT CONTAINER: HISTORICAL DATA LEDGER */}
                            <div className="col-lg-4 border-end bg-white" style={{maxHeight: '70vh', overflowY: 'auto'}}>
                                <div className="p-3 border-bottom sticky-top bg-white">
                                    <input type="text" className="form-control form-control-sm rounded-pill" placeholder="Search Order ID..." />
                                </div>

                                {isOrdersLoading ? (
                                    <div className="text-center p-4 text-muted small">Loading order pipeline charts...</div>
                                ) : customerOrders.length > 0 ? (
                                    customerOrders.map((order) => {
                                        const isSelected = selectedOrder?.id === order.id;

                                        let badgeClass = isSelected ? 'bg-white text-success' : 'bg-success';
                                        if (order.order_status === 'Received') {
                                            badgeClass = isSelected ? 'bg-white text-dark' : 'bg-secondary';
                                        } else if (order.order_status === 'Cancelled' || order.order_status === 'Rejected') {
                                            badgeClass = isSelected ? 'bg-white text-danger' : 'bg-danger';
                                        }

                                        return (
                                            <div
                                                key={order.id}
                                                onClick={() => setSelectedOrder(order)}
                                                className={`p-3 border-bottom transition-all ${
                                                    isSelected ? 'bg-lpmpc-green text-white shadow-sm' : 'hover-bg-light'
                                                }`}
                                                style={{cursor: 'pointer'}}
                                            >
                                                <div className="d-flex justify-content-between align-items-start mb-1">
                                                    <span className={`fw-bold small ${isSelected ? 'text-white' : 'text-dark'}`}>
                                                        REF-{order.id.slice(0, 5).toUpperCase()}
                                                    </span>
                                                    <span className={`badge rounded-pill ${badgeClass}`} style={{fontSize: '0.65rem'}}>
                                                        {order.order_status}
                                                    </span>
                                                </div>
                                                <p className={`mb-0 ${isSelected ? 'text-white-50' : 'text-muted'}`} style={{fontSize: '0.75rem'}}>
                                                    {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </p>
                                                <p className={`fw-bold mb-0 ${isSelected ? 'text-white' : 'text-success'}`}>
                                                    ₱{Number(order.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center p-5 text-muted small">No order records tracked under your profile.</div>
                                )}
                            </div>

                            {/* RIGHT SIDE: DETAILED VIEW WITH PRODUCTION TRACKER STEPPER */}
                            <div className="col-lg-8 p-4 bg-white">
                                {selectedOrder ? (
                                    (() => {
                                        const isTerminated = selectedOrder.order_status === 'Cancelled' || selectedOrder.order_status === 'Rejected';

                                        const statusIndexMap = { 'Pending': 0, 'Confirmed': 1, 'Processing': 2, 'In Transit': 3, 'Received': 4 };
                                        const currentProgressLevel = statusIndexMap[selectedOrder.order_status] ?? 0;

                                        const workflowSteps = [
                                            { label: 'Confirmed', icon: 'check_circle', done: !isTerminated && currentProgressLevel >= 1 },
                                            { label: 'Processing', icon: 'inventory_2', done: !isTerminated && currentProgressLevel >= 2 },
                                            { label: 'In Transit', icon: 'local_shipping', done: !isTerminated && currentProgressLevel >= 3 },
                                            { label: 'Received', icon: 'handshake', done: !isTerminated && currentProgressLevel >= 4 }
                                        ];

                                        return (
                                            <>
                                                <div className="d-flex justify-content-between align-items-center mb-4">
                                                    <div>
                                                        <h4 className="fw-bold mb-0">Order ID: #{selectedOrder.id.slice(0, 8).toUpperCase()}</h4>
                                                        <p className="text-muted small">
                                                            Placed on {new Date(selectedOrder.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} • {new Date(selectedOrder.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                    {!isTerminated && <button className="btn btn-sm btn-outline-success rounded-pill px-3">Download Invoice</button>}
                                                </div>

                                                {/* Real-Time Production Tracker / Termination Banner */}
                                                {isTerminated ? (
                                                    <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-danger-subtle border-start border-4 border-danger">
                                                        <div className="d-flex align-items-center">
                                                            <span className="material-symbols-outlined text-danger me-3" style={{fontSize: '2.5rem'}}>cancel</span>
                                                            <div>
                                                                <h5 className="fw-bold text-danger mb-1">Order {selectedOrder.order_status}</h5>
                                                                <p className="text-dark small mb-0">
                                                                    This transaction record has been marked as <strong>{selectedOrder.order_status.toLowerCase()}</strong> by the store administration framework. Please reach out to customer coordination channels if you require further verification.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-light">
                                                        <h6 className="fw-bold mb-4 text-uppercase small text-muted">Real-time Order Status</h6>
                                                        <div className="d-flex justify-content-between position-relative">
                                                            <div className="position-absolute top-50 start-0 end-0 translate-middle-y bg-secondary-subtle" style={{height: '3px', zIndex: 0}}></div>
                                                            {workflowSteps.map((step, i) => (
                                                                <div key={i} className="text-center position-relative" style={{zIndex: 1}}>
                                                                    <div className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 transition-all ${
                                                                        step.done ? 'bg-success text-white shadow fw-bold' : 'bg-white border text-muted'
                                                                    }`} style={{width: '44px', height: '44px'}}>
                                                                        <span className="material-symbols-outlined" style={{fontSize: '1.2rem'}}>{step.icon}</span>
                                                                    </div>
                                                                    <span className={`d-block ${step.done ? 'fw-bold text-success' : 'text-muted'}`} style={{fontSize: '0.75rem'}}>{step.label}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="card border-0 shadow-sm rounded-4 p-4">
                                                    <h6 className="fw-bold mb-3 text-uppercase small text-muted">Order Summary Specs</h6>
                                                    <div className="table-responsive">
                                                        <table className="table table-borderless align-middle">
                                                            <thead className="table-light">
                                                                <tr style={{fontSize: '0.75rem'}} className="text-muted">
                                                                    <th>Fiber Grade</th>
                                                                    <th className="text-center">Ordered Weight (kg)</th>
                                                                    <th className="text-center">Unit Price</th>
                                                                    <th className="text-end">Subtotal Price</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody style={{fontSize: '0.85rem'}}>
                                                                {selectedOrder.order_items?.map((item, idx) => (
                                                                    <tr key={item.id || idx}>
                                                                        <td><span className="fw-bold text-dark">{item.item_name}</span></td>
                                                                        <td className="text-center">{item.fiber_weight || item.measurements?.weight_kg || 1} kg</td>
                                                                        <td className="text-center">₱{item.unit_price || PRICE_PER_KG} / kg</td>
                                                                        <td className="text-end fw-bold">₱{Number((item.unit_price || PRICE_PER_KG) * (item.fiber_weight || item.measurements?.weight_kg || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                            <tfoot>
                                                                <tr className="border-top">
                                                                    <td colSpan="3" className="text-end fw-bold pt-3">Total Amount Paid:</td>
                                                                    <td className={`text-end fw-bold pt-3 ${isTerminated ? 'text-muted text-decoration-line-through' : 'text-success'}`} style={{fontSize: '1.2rem'}}>
                                                                        ₱{Number(selectedOrder.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                    </td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()
                                ) : (
                                    <div className="text-center p-5 text-muted">
                                        Select an entry from the tracking panel ledger to review full system values.
                                    </div>
                                )}
                            </div>

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