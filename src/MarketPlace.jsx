import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

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

    // PRODUCT AND ORDER STATES
    const [selectedProduct, setSelectedProduct] = useState({ title: '', price: 0 });
    const [isCustomized, setIsCustomized] = useState(false);
    const [quantity, setQuantity] = useState(1);

    // CUSTOMIZATION STATES
    const [customUnits, setCustomUnits] = useState([
        { id: 1, qty: 1, bust: '', waist: '', length: '' }
    ]);
    const [orderDesign, setOrderDesign] = useState({ file: null, preview: null });
    const [orderNotes, setOrderNotes] = useState('');

    // LIVE ORDER HISTORY STATES (FIXED CRASH)
    const [customerOrders, setCustomerOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [isOrdersLoading, setIsOrdersLoading] = useState(false);

    // CALCULATIONS
    const totalQuantityInTable = customUnits.reduce((sum, unit) => sum + (Number(unit.qty) || 0), 0);
    const totalItems = totalQuantityInTable > 0 ? totalQuantityInTable : 1;

    const basePrice = Number(selectedProduct.price) || 0;
    const customizationFee = 150 * totalItems;
    const finalTotal = (basePrice * totalItems) + customizationFee;

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
                // Preserves selected item focus accurately
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

    // HANDLERS
    const handleAddUnit = () => {
        const newId = customUnits.length > 0 ? Math.max(...customUnits.map(u => u.id)) + 1 : 1;
        setCustomUnits([...customUnits, { id: newId, qty: 1, bust: '', waist: '', length: '' }]);
    };

    const handleDeleteUnit = (id) => {
        if (customUnits.length > 1) {
            setCustomUnits(customUnits.filter(unit => unit.id !== id));
        } else {
            alert("At least one measurement set is required.");
        }
    };

    const handleUnitChange = (id, field, value) => {
        setCustomUnits(customUnits.map(unit =>
            unit.id === id ? { ...unit, [field]: field === 'qty' ? Number(value) : value } : unit
        ));
    };

    const handleOrderImage = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setOrderDesign({ file: file, preview: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handlePlaceOrder = async () => {
        try {
            const currentCustomerName = fullName || "Anonymous Guest";
            const shippingMethodEl = document.getElementById('shippingMethod');
            const deliveryMethodVal = shippingMethodEl ? shippingMethodEl.value : 'Standard Shipping (3-5 days)';

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

            const orderItemsData = customUnits.map(unit => ({
                order_id: parentOrder.id,
                item_name: selectedProduct.title,
                fiber_type: "PID-Prime",
                fiber_weight: 1.5,
                measurements: {
                    bust: unit.bust,
                    waist: unit.waist,
                    length: unit.length,
                    qty: unit.qty
                },
                unit_price: selectedProduct.price
            }));

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
            alert("Ops! May error sa pag-save ng order. Check console.");
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
            } else if (profile.role === "farmer") {
                alert("Welcome, Partner Farmer!");
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
                              <a className="nav-link" href="#products">Products</a>
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
                  <h2 className="display-5 fw-bold lpmpc-green">Buy high-quality fabrics and cloths made of Queen Pineapple Fiber.</h2>
              </div>
          </section>

          {/* PRODUCTS SECTION */}
          <section id="products" className="container my-5">
              <div className="mb-5">

                <h2 className="display-5 text-center fw-bold lpmpc-green">Our Products</h2>
                <p className="text-center text-muted">High-quality fabrics made of Queen Pineapple Fiber</p>

                {/* CUSTOM ORDER BUTTON */}
                <div className="d-flex justify-content-end mt-3">
                    <button
                        className="btn btn-outline-success px-4 py-2 rounded-pill fw-bold shadow-sm d-flex align-items-center"
                        data-bs-toggle="modal"
                        data-bs-target={user ? "#orderModal" : "#signupModal"}
                        onClick={() => {
                            setSelectedProduct({ title: "Custom Tailored Request", price: 1000 });
                            setIsCustomized(true);
                        }}
                      >

                        <span className="material-symbols-outlined me-2" style={{fontSize: '1.2rem'}}>measuring_tape</span>Request Custom Order
                    </button>
                </div>
              </div>

              <div className="row g-4 text-start">
                  {[
                      { title: "Piña Alampay", img: "/alampay.jpg", desc: "Experience the Queen of Philippine Fabrics with our handcrafted Piña Alampay. Woven from premium, hand-scraped pineapple fibers." },
                      { title: "Barong", img: "/barong.jpg", desc: "Hand-scraped pineapple fibers woven into a premier choice for graduates and formal events." },
                      { title: "Piña Cloth", img: "/pinacloth.jpg", desc: "Dignified and elegant alternative to traditional stoles, handcrafted by the cooperative." }
                  ].map((p, i) => (
                      <div key={i} className="col-12 col-md-6 col-lg-4">
                          <div className="card h-100 border-0 shadow-sm rounded-4 overflow-hidden">
                              <img src={p.img} className="card-img-top" alt={p.title} style={{height: '250px', objectFit: 'cover'}} />

                              <div className="card-body d-flex flex-column p-4">
                                  <h3 className="h4 fw-bold">{p.title}</h3>
                                  <p className="text-muted small flex-grow-1">{p.desc}</p>

                                  {/* STANDARD ORDER BUTTON */}
                                  <button
                                    className="btn btn-custom-green w-100 mt-3 py-2 fw-bold"
                                    data-bs-toggle="modal"
                                    data-bs-target={user ? "#orderModal" : "#signupModal"}
                                    onClick={() => {
                                        setSelectedProduct({ title: p.title, price: p.price || 500 });
                                        setIsCustomized(true);
                                    }}
                                  >
                                    {user ? 'Add to Cart' : 'Order Now!'}
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

      {/* ORDER SELECTION MODAL */}
      <div className="modal fade" id="orderModal" tabIndex="-1" aria-hidden="true">
          <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="p-4 text-white" style={{ background: 'var(--lpmpc-green)' }}>
                      <div className="d-flex justify-content-between align-items-center">
                          <div>
                              <h5 className="fw-bold m-0 text-uppercase small" style={{opacity: 0.8}}>Confirm Order</h5>
                              <h4 className="fw-bold m-0">{selectedProduct.title}</h4>
                          </div>
                          <button type="button" className="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                      </div>
                  </div>

                  <div className="modal-body p-4 bg-white">

                     {isCustomized && (
                          <div className="reveal active">
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                  <h6 className="fw-bold m-0 text-success">Measurement Sets</h6>
                                  <button className="btn btn-sm btn-success rounded-pill px-3" onClick={handleAddUnit}>+ Add New Size Set</button>
                              </div>
                              <div className="table-responsive rounded-3 border mb-4">
                                  <table className="table table-sm text-center mb-0" style={{fontSize: '0.85rem'}}>
                                      <thead className="table-light">
                                          <tr><th>SET</th><th style={{width: '80px'}}>QTY</th><th>BUST</th><th>WAIST</th><th>LENGTH</th></tr>
                                      </thead>
                                      <tbody>
                                          {customUnits.map((unit) => (
                                              <tr key={unit.id}>
                                                  <td className="fw-bold text-success">#{unit.id}</td>
                                                  <td>
                                                      <input type="number" className="form-control form-control-sm text-center border-success"
                                                          value={unit.qty} min="1" onChange={(e) => handleUnitChange(unit.id, 'qty', e.target.value)} />
                                                  </td>
                                                  <td><input type="text" className="form-control form-control-sm text-center" placeholder='0"' value={unit.bust} onChange={(e) => handleUnitChange(unit.id, 'bust', e.target.value)} /></td>
                                                  <td><input type="text" className="form-control form-control-sm text-center" placeholder='0"' value={unit.waist} onChange={(e) => handleUnitChange(unit.id, 'waist', e.target.value)} /></td>
                                                  <td><input type="text" className="form-control form-control-sm text-center" placeholder='0"' value={unit.length} onChange={(e) => handleUnitChange(unit.id, 'length', e.target.value)} /></td>
                                                  <td>
                                                      {/* DELETE BUTTON */}
                                                      <button
                                                          className="btn btn-sm text-danger d-flex align-items-center justify-content-center"
                                                          onClick={() => handleDeleteUnit(unit.id)}
                                                          title="Remove Set"
                                                      >
                                                          <span className="material-symbols-outlined" style={{fontSize: '1.2rem'}}>delete</span>
                                                      </button>
                                                  </td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>

                              <div className="row g-3">
                                  <div className="col-md-6">
                                      <h6 className="fw-bold small text-muted text-uppercase">Design Reference (1 per order)</h6>
                                      <div className="upload-container border-2 border-dashed rounded-4 p-3 text-center bg-light position-relative d-flex flex-column align-items-center justify-content-center" style={{minHeight: '140px'}}>
                                          {orderDesign.preview ? (
                                              <>
                                                  <img src={orderDesign.preview} className="img-fluid rounded mb-2" style={{maxHeight: '80px'}} />
                                                  <span className="small text-success fw-bold">Design Attached</span>
                                              </>
                                          ) : (
                                              <><span className="material-symbols-outlined text-muted" style={{fontSize: '2rem'}}>add_a_photo</span><p className="small m-0">Upload Sketch</p></>
                                          )}
                                          <input type="file" className="position-absolute top-0 start-0 opacity-0 w-100 h-100" onChange={handleOrderImage} style={{cursor: 'pointer'}} />
                                      </div>
                                  </div>
                                  <div className="col-md-6">
                                      <h6 className="fw-bold small text-muted text-uppercase">Additional Instructions</h6>
                                      <textarea className="form-control rounded-3" rows="5" placeholder="Fabric color, specific name embroidery, etc." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} style={{fontSize: '0.85rem'}}></textarea>
                                  </div>
                              </div>
                          </div>
                      )}

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
                                      <option value="standard">Standard Shipping (3-5 days)</option>
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
                                      <strong>Admin Verification:</strong> All orders are subject to fiber quality assessment. The admin will first verify if the available Queen Pineapple fiber is adequate for your specific request. If not, the order may be rejected to maintain quality standards.
                                  </li>
                                  <li>
                                      <strong>Timeline:</strong> Please note that the <strong>estimated shipping days do not include the preparation and weaving period</strong>. Handcrafting heritage fabrics takes time to ensure the highest quality.
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
                                ₱{finalTotal.toLocaleString()}
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
                              <p className="opacity-75">Connecting you to the finest handcrafted heritage fabrics of Labo.</p>
                          </div>

                          <div className="mt-4 pt-4 border-top border-white border-opacity-25">
                              <small>Support Local Farmers • Sustainable Fashion • Premium Quality</small>
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
                              : 'Join our community to shop for handcrafted Queen Pineapple fabrics and track your orders.'}
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

                                        // Custom color mapping for badges based on dynamic pipeline data
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
                                        const primaryItem = selectedOrder.order_items?.[0] || {};
                                        const specs = primaryItem.measurements || {};

                                        const measurementString = specs.bust ? `${specs.bust}" / ${specs.waist}" / ${specs.length}"` : 'Standard Size';
                                        const computedQty = selectedOrder.order_items?.reduce((acc, curr) => acc + (curr.measurements?.qty || 1), 0) || 1;

                                        const isTerminated = selectedOrder.order_status === 'Cancelled' || selectedOrder.order_status === 'Rejected';

                                        const statusIndexMap = { 'Pending': 0, 'Confirmed': 1, 'Weaving': 2, 'In Production': 2, 'Shipping': 3, 'Received': 4 };
                                        const currentProgressLevel = statusIndexMap[selectedOrder.order_status] ?? 0;

                                        const workflowSteps = [
                                            { label: 'Confirmed', icon: 'check_circle', done: !isTerminated && currentProgressLevel >= 1 },
                                            { label: 'Weaving', icon: 'texture', done: !isTerminated && currentProgressLevel >= 2 },
                                            { label: 'Shipping', icon: 'local_shipping', done: !isTerminated && currentProgressLevel >= 3 },
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
                                                        <h6 className="fw-bold mb-4 text-uppercase small text-muted">Real-time Production Status</h6>
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
                                                                    <th>Product Description</th>
                                                                    <th>Measurements (B/W/L)</th>
                                                                    <th className="text-center">Total Unit Qty</th>
                                                                    <th className="text-end">Subtotal Price</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody style={{fontSize: '0.85rem'}}>
                                                                {selectedOrder.order_items?.map((item, idx) => (
                                                                    <tr key={item.id || idx}>
                                                                        <td><span className="fw-bold text-dark">{item.item_name}</span></td>
                                                                        <td>
                                                                            <span className="badge bg-light text-secondary border">
                                                                                {item.measurements?.bust ? `${item.measurements.bust}" / ${item.measurements.waist}" / ${item.measurements.length}"` : 'Standard'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="text-center">{item.measurements?.qty || 1}</td>
                                                                        <td className="text-end fw-bold">₱{Number(item.unit_price * (item.measurements?.qty || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
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