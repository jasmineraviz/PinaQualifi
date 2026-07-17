import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import { createClient } from '@supabase/supabase-js';
import emailjs from '@emailjs/browser';

Chart.register(...registerables);

const supabaseUrl = 'https://bqblzvgwkvdkanobntgn.supabase.co';
const supabaseKey = 'sb_publishable_cKKlFv0eCaArfywT-fqzaQ_QEXrLLbm';
const supabase = createClient(supabaseUrl, supabaseKey);

const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('v-dash');
    const [dateStr, setDateStr] = useState('');
    const [salesView, setSalesView] = useState('paid');
    const [bastosChartData, setBastosChartData] = useState({ labels: [], values: [] });

    // STATE FOR REAL-TIME FARM DATA
    const [farms, setFarms] = useState([]);
    const [isFarmsLoading, setIsFarmsLoading] = useState(true);

    const colorMap = {
        'PID-1': '#468432',
        'PID-2': '#5da441',
        'PID-3': '#ffd700',
        'PID-4': '#ffef91',
        'PID-R': '#6c757d'
    };

    // REFS FOR LIBRARIES
    const timelineRef = useRef(null);
    const chartRef = useRef(null);
    const timelineContainer = useRef(null);
    const chartCanvas = useRef(null);
    const salesChartCanvas = useRef(null);
    const salesChartRef = useRef(null);

    // REACTIVE VIS-TIMELINE DATA SETS
    const groups = useRef(new DataSet([]));
    const items = useRef(new DataSet([]));

    // STATE MANAGEMENT
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);

    const handleViewDetails = (e, orderData) => {
        if (e) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }

        setSelectedOrder(orderData);

        const modalElement = document.getElementById('orderDetailModal');
        if (modalElement) {
            try {
                const bootstrapObj = window.bootstrap || (window.Bootstrap && window.Bootstrap.Modal);
                if (bootstrapObj) {
                    const modalInstance = bootstrapObj.Modal.getOrCreateInstance(modalElement);
                    modalInstance.show();
                } else {
                    console.error("Bootstrap JS library is not loaded globally.");
                }
            } catch (err) {
                console.error("Modal transition fault:", err.message);
            }
        }
    };

    // SUPABASE STATE MANAGEMENT
    const [supabaseOrders, setSupabaseOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // DYNAMIC FILTER ENGINE
    const cardPendingOrders = supabaseOrders.filter(o => o.order_status === 'Pending');
    const tableQueueOrders = supabaseOrders.filter(o =>
        o.order_status !== 'Pending' &&
        o.order_status !== 'Rejected' &&
        o.order_status !== 'Cancelled'
    );
    const paidOrders = supabaseOrders.filter(o => o.order_status === 'Received');
    const unpaidOrders = supabaseOrders.filter(o =>
        o.order_status !== 'Received' &&
        o.order_status !== 'Rejected' &&
        o.order_status !== 'Cancelled'
    );
    const totalPaidAmount = paidOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalUnpaidAmount = unpaidOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalSalesOrdersCount = supabaseOrders.filter(o => o.order_status !== 'Cancelled' && o.order_status !== 'Rejected').length;

    // LIVE WIDGETS COUNTER MATRIX
    const pendingCount = cardPendingOrders.length;
    const productionCount = supabaseOrders.filter(o => o.order_status === 'Weaving' || o.order_status === 'Confirmed').length;
    const completedCount = supabaseOrders.filter(o => o.order_status === 'Received' || o.order_status === 'Shipping').length;

    // FETCHES ORDERS
    const fetchOrdersFromSupabase = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    *,
                    order_items (*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSupabaseOrders(data || []);
        } catch (error) {
            console.error('Error fetching orders:', error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // FETCHES FARMS FROM DATABASE
    const fetchFarmsFromSupabase = async () => {
        try {
            setIsFarmsLoading(true);
            const { data, error } = await supabase
                .from('farm')
                .select('*')
                .order('farm_name', { ascending: true });

            if (error) throw error;
            setFarms(data || []);
            updateTimelineData(data || []);
        } catch (error) {
            console.error('Error fetching farm database data:', error.message);
        } finally {
            setIsFarmsLoading(false);
        }
    };

    // PROCESSES AND TRANSFORMS SUPABASE DATA FOR THE TIMELINE
        const updateTimelineData = (farmData) => {
            if (!groups.current || !items.current) return;

            groups.current.clear();
            items.current.clear();

            const uniqueFarms = [];
            const dynamicItems = [];

            farmData.forEach((farm) => {
                const groupId = String(farm.id);
                const itemId = `item_${farm.id}`;

                // Pass clean plaintext strings for group contents
                uniqueFarms.push({
                    id: groupId,
                    content: farm.farm_name
                });

                // Sa loob ng updateTimelineData:
                const phaseName = farm.status_name || 'Vegetative';
                const statusKey = phaseName.toLowerCase();

                // I-map ang status sa specific CSS class para sa timeline
                const timelineClasses = {
                    vegetative: 'bar-veg',
                    flowering: 'bar-flow',
                    maturation: 'bar-maturation',
                    harvesting: 'bar-harvest'
                };

                dynamicItems.push({
                    id: itemId,
                    group: groupId,
                    content: phaseName,
                    start: farm.start_date,
                    end: farm.end_date,
                    className: timelineClasses[statusKey] || 'bar-veg'
                });
            });

            groups.current.add(uniqueFarms);
            items.current.add(dynamicItems);

            if (timelineRef.current) {
                timelineRef.current.setGroups(groups.current);
                timelineRef.current.setItems(items.current);
                timelineRef.current.redraw();

                // Forces the timeline camera window to scale and center on the new bars
                setTimeout(() => {
                    if (timelineRef.current && farmData.length > 0) {
                        timelineRef.current.fit({ animation: false });
                    }
                }, 50);
            }
        };

    // AUTOMATIC LIVE SYNC LISTENER
    useEffect(() => {
        fetchOrdersFromSupabase();
        fetchBastosInventory();
        fetchFarmsFromSupabase();

        const channel = supabase
            .channel('admin-orders-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => { fetchOrdersFromSupabase(); }
            )
            .subscribe();

        const bastosChannel = supabase
            .channel('admin-bastos-sync')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bastos_logs' }, () => {
                fetchBastosInventory();
            })
            .subscribe();

        // REAL-TIME LISTENER ENGINE BINDING FOR FARM RECORDS
        const farmChannel = supabase
            .channel('admin-farm-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'farm' },
                () => { fetchFarmsFromSupabase(); }
            )
            .subscribe();

        const modalElement = document.getElementById('orderDetailModal');
        const handleModalHidden = () => {
            setSelectedOrder(null);
        };

        if (modalElement) {
            modalElement.addEventListener('hidden.bs.modal', handleModalHidden);
        }

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(bastosChannel);
            supabase.removeChannel(farmChannel);
            if (modalElement) {
                modalElement.removeEventListener('hidden.bs.modal', handleModalHidden);
            }
        };
    }, []);

    // APPROVE ORDER
    const handleApproveOrder = async (orderId) => {
        try {
            const { error } = await supabase
                .from('orders')
                .update({ order_status: 'Confirmed' })
                .eq('id', orderId);

            if (error) throw error;
        } catch (error) {
            alert("Error approving market data: " + error.message);
        }
    };

    // REJECT ORDER
    const handleRejectOrder = async (orderId) => {
        if (window.confirm("Are you sure you want to reject this request? Entry will be preserved for customer history.")) {
            try {
                const { error } = await supabase
                    .from('orders')
                    .update({ order_status: 'Rejected' })
                    .eq('id', orderId);

                if (error) throw error;
            } catch (error) {
                alert("Error modifying record: " + error.message);
            }
        }
    };

    const updateOrderStatus = async (orderId, newStatus) => {
        try {
            const { error } = await supabase
                .from('orders')
                .update({ order_status: newStatus })
                .eq('id', orderId);

            if (error) throw error;
        } catch (error) {
            alert("Failed to update status: " + error.message);
        }
    };

    const fetchBastosInventory = async () => {
        try {
            const { data, error } = await supabase
                .from('bastos_logs')
                .select('grade');

            if (error) throw error;

            if (data) {
                const logCounts = data.reduce((acc, row) => {
                    let fiberGrade = row.grade ? row.grade.trim().toUpperCase() : 'PID-R';
                    if (fiberGrade === 'PID-R (RESIDUAL)') {
                        fiberGrade = 'PID-R';
                    }

                    acc[fiberGrade] = (acc[fiberGrade] || 0) + 1;
                    return acc;
                }, {});

                const expectedGrades = ['PID-1', 'PID-2', 'PID-3', 'PID-4', 'PID-R'];
                const labels = [];
                const values = [];

                expectedGrades.forEach(grade => {
                    labels.push(grade);
                    values.push(logCounts[grade] || 0);
                });

                setBastosChartData({ labels, values });
            }
        } catch (error) {
            console.error('Error fetching inventory from bastos_logs:', error.message);
        }
    };

    useEffect(() => {
        const now = new Date().toLocaleDateString('en-PH', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
        setDateStr(now);

        const handleResize = () => {
            if (chartRef.current) chartRef.current.resize();
            if (salesChartRef.current) salesChartRef.current.resize();
            if (timelineRef.current) timelineRef.current.checkResize();
        };
        window.addEventListener('resize', handleResize);

        // INITIALIZE THE VIS TIMELINE GRAPH OBJECT WITH DEFAULT DATA SET REFS BOUND
        if (timelineContainer.current && !timelineRef.current) {
            timelineRef.current = new Timeline(timelineContainer.current, items.current, groups.current, {
                height: '420px',
                start: '2024-09-01',
                end: '2027-06-01',
                orientation: 'top',
                stack: true,
                editable: false
            });
        }

        if (chartCanvas.current && !chartRef.current) {
            chartRef.current = new Chart(chartCanvas.current, {
                type: 'doughnut',
                data: {
                    labels: ['PID-1', 'PID-2', 'PID-3', 'PID-4', 'PID-R'],
                    datasets: [{
                        data: ['PID-1', 'PID-2', 'PID-3', 'PID-4', 'PID-R'].map(grade => {
                            if (!bastosChartData.labels.length) return 0;
                            const idx = bastosChartData.labels.indexOf(grade);
                            return idx !== -1 ? bastosChartData.values[idx] : 0;
                        }),
                        backgroundColor: ['#468432', '#5da441', '#ffd700', '#ffef91', '#6c757d'],
                        borderWidth: 4,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                usePointStyle: true,
                                pointStyle: 'circle',
                                padding: 20,
                                font: { family: "'Montserrat', sans-serif", size: 12, weight: '600' },
                                color: '#1e1e24'
                            }
                        }
                    },
                    cutout: '55%'
                }
            });
        }

        if (salesChartCanvas.current && !salesChartRef.current) {
            const ctx = salesChartCanvas.current.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(70, 132, 50, 0.2)');
            gradient.addColorStop(1, 'rgba(70, 132, 50, 0)');

            const monthlyData = Array(6).fill(0);
            supabaseOrders.forEach(order => {
                if (order.order_status === 'Received') {
                    const date = new Date(order.created_at);
                    const monthIndex = date.getMonth();
                    if (monthIndex >= 0 && monthIndex < 6) {
                        monthlyData[monthIndex] += Number(order.total_amount) || 0;
                    }
                }
            });

            salesChartRef.current = new Chart(salesChartCanvas.current, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Income (₱)',
                        data: monthlyData,
                        borderColor: '#468432',
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false } },
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
            if (salesChartRef.current) { salesChartRef.current.destroy(); salesChartRef.current = null; }
        };
    }, [activeTab]);

    useEffect(() => {
        if (chartRef.current && bastosChartData.labels.length > 0) {
            chartRef.current.data.labels = bastosChartData.labels;
            chartRef.current.data.datasets[0].data = bastosChartData.values;
            chartRef.current.update();
        }
    }, [bastosChartData]);

    useEffect(() => {
        if (salesChartRef.current) {
            const monthlyData = Array(6).fill(0);
            supabaseOrders.forEach(order => {
                if (order.order_status === 'Received') {
                    const date = new Date(order.created_at);
                    const monthIndex = date.getMonth();
                    if (monthIndex >= 0 && monthIndex < 6) {
                        monthlyData[monthIndex] += Number(order.total_amount) || 0;
                    }
                }
            });
            salesChartRef.current.data.datasets[0].data = monthlyData;
            salesChartRef.current.update();
        }
    }, [supabaseOrders]);

    // ENSURE TIMELINE CALLS REDRAW ACTIONS WHEN ACTIVATING TABS OR UPDATE EVENTS FINISH PROCESSING
    useEffect(() => {
        if (activeTab === 'v-farm') {
            setTimeout(() => {
                if (timelineRef.current) {
                    timelineRef.current.checkResize();
                    timelineRef.current.redraw();
                    if (farms.length > 0) {
                        timelineRef.current.fit();
                    }
                }
            }, 100);
        }
    }, [activeTab, farms]);

    const filterTimeline = (e) => {
        const val = e.target.value.toLowerCase();
        groups.current.forEach((group) => {
            // Strip HTML tags away from text content for accurate text search
            const innerText = group.content.replace(/<[^>]*>/g, '').toLowerCase();
            const isVisible = innerText.indexOf(val) !== -1;
            groups.current.update({ id: group.id, visible: isVisible });
        });
    };


   const handleCreateFarmer = async (e) => {
       e.preventDefault();
       const formData = new FormData(e.target);
       const data = Object.fromEntries(formData.entries());

       try {
           // 1. Create Auth User
           const { data: authData, error: authError } = await supabase.auth.signUp({
               email: data.email,
               password: data.password,
               options: { data: { full_name: data.fullName } }
           });

           if (authError) throw authError;

           // 2. Insert details into 'users' table
           const { error: dbError } = await supabase.from('users').insert([
               {
                   id: authData.user.id,
                   full_name: data.fullName,
                   email: data.email,
                   address: data.address,
                   farm_name: data.farmName,
                   contact_no: data.contactNo,
                   role: 'farmer'
               }
           ]);

           if (dbError) throw dbError;
            // Send SMS text reminder to the farmer via Semaphore API
            try {
                const smsMessage = `Hi ${data.fullName}, your LPMPC Farmer account has been successfully created! Please check your email (${data.email}) for your login credentials and important instructions. - LPMPC PinaQualify`;
                const smsBody = new URLSearchParams({
                    apikey: '3d81194ec2cf0d9b33c8221724d35887',
                    number: data.contactNo,
                    message: smsMessage
                });

                 const smsRes = await fetch('/api/semaphore/api/v4/messages', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                     body: smsBody.toString()
                 });
                 const smsResult = await smsRes.json();
                 console.log('Semaphore SMS response:', smsResult);
            } catch (smsErr) {
                console.warn('SMS notification failed:', smsErr.message);
            }

            // Send email with temporary password via EmailJS
            try {
                await emailjs.send('service_bxxlbqj', 'template_bs6zso6', {
                    email: data.email,
                    farmer_name: data.fullName,
                    farmer_email: data.email,
                    temp_password: data.password
                }, '80xVnHaUIC6d2lJ5l');
                console.log('EmailJS: Farmer notification email sent successfully');
            } catch (emailErr) {
                console.warn('Email notification failed:', emailErr);
            }

           alert("Farmer account created successfully!");
           document.querySelector('[data-bs-dismiss="modal"]').click();
           e.target.reset();
       } catch (err) {
           alert("Error: " + err.message);
       }
   };


    return (
        <div className="admin-layout admin-layout-wrapper">
            <div className="container-fluid p-0">
                <div className="row g-0">

                    {/* SIDE NAVIGATION LAYOUT */}
                    <nav className="col-md-3 col-lg-2 bg-lpmpc-green vh-100 position-fixed shadow-sm">
                        <div className="p-4 border-bottom border-white border-opacity-25">
                            <h4 className="fw-bold m-0 text-gold">LPMPC</h4>
                        </div>
                        <div className="nav flex-column mt-md-3">
                            <button className={`admin-tab-btn ${activeTab === 'v-dash' ? 'active' : ''}`} onClick={() => setActiveTab('v-dash')}>
                                <span className="material-symbols-outlined">dashboard</span> DASHBOARD
                            </button>
                            <button className={`admin-tab-btn ${activeTab === 'v-farm' ? 'active' : ''}`} onClick={() => setActiveTab('v-farm')}>
                                <span className="material-symbols-outlined">timeline</span> FARM
                            </button>
                            <button className={`admin-tab-btn ${activeTab === 'v-inv' ? 'active' : ''}`} onClick={() => setActiveTab('v-inv')}>
                                <span className="material-symbols-outlined">inventory</span> INVENTORY
                            </button>
                            <button className={`admin-tab-btn ${activeTab === 'v-order' ? 'active' : ''}`} onClick={() => setActiveTab('v-order')}>
                                <span className="material-symbols-outlined">shopping_bag</span> ORDER
                            </button>
                            <button className={`admin-tab-btn ${activeTab === 'v-sales' ? 'active' : ''}`} onClick={() => setActiveTab('v-sales')}>
                                <span className="material-symbols-outlined">payments</span> SALES
                            </button>
                        </div>
                    </nav>

                    {/* MAIN CONTROLLER CONTAINER */}
                    <main className="col-md-9 col-lg-10 offset-md-3 offset-lg-2 p-3 p-md-4">

                        {/* [TAB 1] : DASHBOARD LAYOUT */}
                        <div className={`admin-tab-content ${activeTab !== 'v-dash' ? 'd-none' : ''}`}>
                            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                                <div>
                                    <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">DASHBOARD</h2>
                                    <p className="text-muted m-0 small">Summary Overview</p>
                                </div>
                                <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                            </div>

                            <div className="row g-3 mb-5">
                                {[
                                    { label: 'Total Sales', count: isLoading ? '...' : `₱${totalPaidAmount.toLocaleString()}`, color: '#468432' },
                                    { label: 'Active Farms', count: isFarmsLoading ? '...' : farms.length, color: '#b59a00' },
                                    { label: 'Current Market Orders', count: isLoading ? '...' : supabaseOrders.length, color: '#6c757d' }
                                ].map((w, i) => (
                                    <div className="col-12 col-sm-4" key={i}>
                                        <div className="p-4 bg-white border border-light shadow-sm h-100 rounded-0 border-bottom border-3" style={{ borderBottom: `3px solid ${w.color}` }}>
                                            <div className="text-muted fw-bold text-uppercase mb-2" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>{w.label}</div>
                                            <h2 className="fw-bold m-0" style={{ fontSize: '32px', color: w.color }}>{w.count}</h2>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="row g-3">
                                <div className="col-12 col-lg-7">
                                    <div className="card border-0 rounded-4 p-3 p-md-4 shadow-sm bg-white h-100" style={{ minHeight: '300px' }}>
                                        <div className="mb-4">
                                            <h6 className="fw-bold text-uppercase m-0 lpmpc-green" style={{ fontSize: '0.85rem' }}>Sales Income (Monthly)</h6>
                                        </div>
                                        <div className="flex-grow-1" style={{ position: 'relative', height: '100%' }}>
                                            <canvas ref={salesChartCanvas}></canvas>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-12 col-lg-5">
                                    <div className="card border-0 rounded-4 p-3 p-md-4 shadow-sm bg-white h-100" style={{ minHeight: '300px' }}>
                                        <h6 className="fw-bold text-uppercase mb-4 lpmpc-green" style={{ fontSize: '0.85rem' }}>Yield Distribution</h6>
                                        <div className="flex-grow-1" style={{ position: 'relative', height: '100%' }}>
                                            <canvas ref={chartCanvas}></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* [TAB 2] : FARM MANAGEMENT LAYOUT */}
                        <div className={`admin-tab-content ${activeTab !== 'v-farm' ? 'd-none' : ''}`}>
                            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                                <div>
                                    <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">FARM MANAGEMENT</h2>
                                    <p className="text-muted m-0 small">Dynamic tracking of growth and harvest cycles</p>
                                </div>
                                <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                            </div>

                            <div className="card border rounded-0 mb-3 p-3 bg-white no-hover">
                                <div className="row g-3 align-items-center">
                                    <div className="col-12 col-md-6">
                                        <input type="text" className="form-control" placeholder="Search farm name..." onKeyUp={filterTimeline} />
                                    </div>
                                    <div className="col-12 col-md-6 text-md-end">
                                        <small className="text-muted d-block">Drag to pan • Ctrl + Scroll to zoom</small>
                                    </div>
                                </div>
                            </div>

                            <div className="card border rounded-0 shadow-sm bg-white no-hover overflow-hidden">
                                <div className="card-body p-0">
                                    <div ref={timelineContainer} style={{ width: '100%', overflowX: 'auto' }}></div>
                                </div>
                            </div>

                            <div className="card border rounded-0 shadow-sm bg-white no-hover mt-4">
                                <div className="card-header bg-light border-bottom rounded-0 py-3">
                                    <h5 className="fw-bold m-0 small text-uppercase">Active Farm Batches</h5>
                                </div>
                                <div className="table-responsive">
                                    <table className="table table-hover align-middle mb-0" style={{ minWidth: '700px' }}>
                                        <thead className="table-light text-uppercase small fw-bold">
                                            <tr>
                                                <th className="ps-4">Batch ID</th> {/* Bagong Column */}
                                                <th>Farm Name</th>
                                                <th>Owner / Contact</th>
                                                <th className="d-none d-md-table-cell">Contact Number</th>
                                                <th>Status</th>
                                                <th style={{ width: '150px' }}>Progress</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isFarmsLoading ? (
                                                <tr><td colSpan="6" className="text-center">Syncing...</td></tr>
                                            ) : farms.map((farm) => {
                                                const s = (farm.status_name || 'vegetative').toLowerCase();

                                                const badgeColors = {
                                                    vegetative: 'bg-success text-white',
                                                    flowering: 'bg-pink text-white',
                                                    maturation: 'bg-warning text-dark',
                                                    harvesting: 'bg-info text-white'
                                                };
                                                const badgeClass = badgeColors[s] || 'bg-success text-white';

                                                return (
                                                    <tr key={farm.id}>
                                                        <td className="ps-4 fw-bold">{farm.batch_id}</td> {/* Data ng Batch ID */}
                                                        <td>{farm.farm_name}</td>
                                                        <td>{farm.owner_name}</td>
                                                        <td>{farm.contact_number}</td>
                                                        <td><span className={`badge ${badgeClass}`}>{farm.status_name}</span></td>
                                                        <td>
                                                            <div
                                                                className="d-flex align-items-center justify-content-center text-white fw-bold rounded"
                                                                style={{
                                                                    backgroundColor: '#468432',
                                                                    width: '80px',
                                                                    height: '30px',
                                                                    fontSize: '0.85rem'
                                                                }}
                                                            >
                                                                {farm.progress || 0}%
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <button
                                className="btn rounded-circle shadow-lg position-fixed d-flex align-items-center justify-content-center"
                                style={{
                                    bottom: '30px',
                                    right: '30px',
                                    width: '60px',
                                    height: '60px',
                                    zIndex: 1000,
                                    backgroundColor: '#468432', // LPMPC Green Theme
                                    color: '#ffffff',
                                    fontSize: '24px'
                                }}
                                data-bs-toggle="modal"
                                data-bs-target="#addFarmerModal"
                            >
                                +
                            </button>

                        </div>

                        {/* [TAB 3] : INVENTORY TAB LAYOUT */}
                        <div className={`admin-tab-content ${activeTab !== 'v-inv' ? 'd-none' : ''}`}>
                            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                                <div>
                                    <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">Fiber Inventory</h2>
                                    <p className="text-muted m-0 small">Quality Grading System • Grading & Texture</p>
                                </div>
                                <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                            </div>

                            <div className="row g-4 mb-4">
                                <div className="col-12 col-lg-5">
                                    <div className="card border-0 rounded-4 p-3 p-md-4 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #f8fcf7 0%, #ffffff 100%)', border: '1px solid #e1eedd !important' }}>
                                        <div className="d-flex justify-content-between align-items-start mb-4">
                                            <div>
                                                <h6 className="fw-bold text-uppercase m-0 lpmpc-green" style={{ fontSize: '0.85rem' }}>Robotics Scanner</h6>
                                                <small className="text-muted" style={{ fontSize: '0.7rem' }}>LPMPC-SCAN-01</small>
                                            </div>
                                            <span className="badge rounded-pill pulse px-2 py-2" style={{ backgroundColor: 'var(--lpmpc-light-yellow)', color: 'var(--lpmpc-green)', border: '1px solid var(--lpmpc-green)', fontSize: '0.6rem' }}>
                                                ● LIVE ANALYSIS
                                            </span>
                                        </div>

                                        <div className="flex-grow-1 d-flex flex-column justify-content-center p-3 rounded-4 mb-3" style={{ backgroundColor: '#ffffff', border: '1px solid #e1eedd' }}>
                                            <div className="text-center mb-3">
                                                <span className="material-symbols-outlined lpmpc-green opacity-25" style={{ fontSize: '2rem' }}>precision_manufacturing</span>
                                                <div className="d-flex align-items-center justify-content-center mt-1">
                                                    <span className="material-symbols-outlined lpmpc-green me-2" style={{ fontSize: '1rem' }}>visibility</span>
                                                    <p className="fw-bold lpmpc-green mb-0" style={{ fontSize: '0.75rem' }}>Surface Analysis Active</p>
                                                </div>
                                            </div>

                                            <div className="w-100 px-1">
                                                {[{ l: 'Color', v: '94%' }, { l: 'Purity', v: '88%' }, { l: 'Texture', v: '91%' }].map((m, i) => (
                                                    <div className="mb-2" key={i}>
                                                        <div className="d-flex justify-content-between small mb-1 fw-bold lpmpc-green" style={{ fontSize: '0.7rem' }}>
                                                            <span>{m.l}</span><span>{m.v}</span>
                                                        </div>
                                                        <div className="progress rounded-pill" style={{ height: '5px' }}>
                                                            <div className="progress-bar" style={{ width: m.v, backgroundColor: i === 1 ? 'var(--lpmpc-gold)' : 'var(--lpmpc-green)' }}></div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="row g-1 g-md-2 text-center">
                                            {['Ivory', 'Ochre', 'Brown'].map((label, i) => (
                                                <div key={i} className="col-4">
                                                    <div className="py-1 rounded-2 border bg-light">
                                                        <span className="fw-bold lpmpc-green" style={{ fontSize: '0.6rem' }}>{label}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="col-12 col-lg-7">
                                    <div className="card border-0 rounded-4 p-3 p-md-4 shadow-sm bg-white h-100">
                                        <h6 className="fw-bold text-uppercase mb-4 lpmpc-green" style={{ fontSize: '0.85rem' }}>Recent Scanned Batches</h6>
                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle mb-0" style={{ minWidth: '400px' }}>
                                                <thead>
                                                    <tr className="text-muted text-uppercase small border-bottom" style={{ fontSize: '0.7rem' }}>
                                                        <th className="pb-3">Batch ID</th>
                                                        <th className="pb-3 text-center">Grade</th>
                                                        <th className="pb-3 text-center">Score</th>
                                                        <th className="pb-3 text-end">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody style={{ fontSize: '0.8rem' }}>
                                                    {[
                                                        { id: 'BAT-2026-001', grade: 'Grade A', score: '94/100' },
                                                        { id: 'BAT-2026-002', grade: 'Grade B', score: '85/100' },
                                                        { id: 'BAT-2026-003', grade: 'Grade A', score: '92/100' }
                                                    ].map((batch, idx) => (
                                                        <tr key={idx} className="border-bottom" style={{ cursor: 'pointer' }} onClick={() => setSelectedBatch(batch)}>
                                                            <td className="py-3 fw-bold lpmpc-green">{batch.id}</td>
                                                            <td className="text-center">
                                                                <span className="badge rounded-pill bg-success bg-opacity-10 text-success" style={{ fontSize: '0.65rem' }}>{batch.grade}</span>
                                                            </td>
                                                            <td className="text-center fw-bold text-muted">{batch.score}</td>
                                                            <td className="text-end">
                                                                <button className="btn btn-sm text-success fw-bold p-0" style={{ fontSize: '0.75rem' }}> View Details</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <button className="btn mt-4 py-2 rounded-3 fw-bold text-uppercase w-100" style={{ backgroundColor: 'var(--lpmpc-light-yellow)', color: 'var(--lpmpc-green)', fontSize: '0.75rem', border: 'none' }}>
                                            Generate Quality Audit Report
                                        </button>
                                    </div>
                                </div>

                                <div className="col-12">
                                    <div className="card border-0 rounded-4 p-3 p-md-4 shadow-sm bg-white mt-4">
                                        <div className="d-flex justify-content-between align-items-center mb-4">
                                            <div>
                                                <h6 className="fw-bold text-uppercase m-0 lpmpc-green" style={{ fontSize: '0.85rem' }}>Fiber Stock Ledger</h6>
                                                <small className="text-muted" style={{ fontSize: '0.75rem' }}>Full inventory breakdown by fiber quality</small>
                                            </div>
                                            <div className="d-flex gap-2">
                                                <button className="btn btn-outline-success btn-sm rounded-pill fw-bold px-3" style={{ fontSize: '0.7rem' }}>
                                                    <span className="material-symbols-outlined align-middle me-1" style={{ fontSize: '14px' }}>filter_list</span> Filter
                                                </button>
                                            </div>
                                        </div>

                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle mb-0">
                                                <thead className="bg-light">
                                                    <tr className="text-muted text-uppercase small border-bottom" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                                                        <th className="py-3 ps-3">Fiber ID</th>
                                                        <th className="py-3">Type / Quality</th>
                                                        <th className="py-3 text-center">Available Stock</th>
                                                        <th className="py-3 text-center">Avg. Score</th>
                                                        <th className="py-3 text-center">Status</th>
                                                        <th className="py-3 text-end pe-3">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody style={{ fontSize: '0.85rem' }}>
                                                    {[
                                                        { id: 'FIB-LIN-001', type: 'Liniwan (Premium)', stock: '45.5 kg', score: '96/100', grade: 'Grade A', status: 'Optimal' },
                                                        { id: 'FIB-BAS-002', type: 'Bastos (Coarse)', stock: '12.2 kg', score: '82/100', grade: 'Grade B', status: 'Low Stock' },
                                                        { id: 'FIB-LIN-003', type: 'Liniwan (Standard)', stock: '28.0 kg', score: '89/100', grade: 'Grade A', status: 'Optimal' },
                                                        { id: 'FIB-MIX-004', type: 'Mixed Grade', stock: '5.0 kg', score: '75/100', grade: 'Grade C', status: 'Critical' }
                                                    ].map((fiber, idx) => (
                                                        <tr key={idx} className="border-bottom" style={{ cursor: 'pointer' }} onClick={() => setSelectedBatch(fiber)}>
                                                            <td className="py-3 ps-3 fw-bold lpmpc-green">{fiber.id}</td>
                                                            <td className="py-3">
                                                                <div className="fw-bold">{fiber.type}</div>
                                                                <small className="text-muted">Queen Pineapple Fiber</small>
                                                            </td>
                                                            <td className="py-3 text-center fw-bold">{fiber.stock}</td>
                                                            <td className="py-3 text-center fw-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                                                                {fiber.score.split('/')[0]}<small className="text-muted fw-normal">%</small>
                                                            </td>
                                                            <td className="py-3 text-center">
                                                                <span className={`badge rounded-pill px-2 py-1 ${fiber.status === 'Optimal' ? 'bg-success bg-opacity-10 text-success' :
                                                                        fiber.status === 'Low Stock' ? 'bg-warning bg-opacity-10 text-warning' :
                                                                            'bg-danger bg-opacity-10 text-danger'
                                                                    }`} style={{ fontSize: '0.65rem' }}>
                                                                    {fiber.status}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 text-end pe-3">
                                                                <button className="btn btn-sm text-success fw-bold p-0" style={{ fontSize: '0.75rem' }}>
                                                                    View Details
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {selectedBatch && (
                                <div className="modal-backdrop d-flex align-items-center justify-content-center p-2 p-md-3" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(70, 132, 50, 0.4)', zIndex: 2050, backdropFilter: 'blur(4px)' }}>
                                    <div className="card border-0 rounded-4 shadow-lg w-100" style={{ maxWidth: '500px', background: '#ffffff', maxHeight: '90vh', overflowY: 'auto' }}>
                                        <div className="card-header bg-transparent border-0 p-4 d-flex justify-content-between align-items-center sticky-top bg-white">
                                            <div>
                                                <h5 className="fw-bold lpmpc-green m-0 text-uppercase" style={{ fontSize: '1rem' }}>Batch Analysis Report</h5>
                                                <small className="text-muted">{selectedBatch.id}</small>
                                            </div>
                                            <button className="btn-close" onClick={() => setSelectedBatch(null)}></button>
                                        </div>

                                        <div className="card-body p-4 pt-0">
                                            <div className="text-center p-4 rounded-4 mb-4" style={{ backgroundColor: '#f8fcf7', border: '1px solid #e1eedd' }}>
                                                <p className="text-muted small text-uppercase fw-bold mb-1">Final Quality Score</p>
                                                <h1 className="display-4 fw-bold lpmpc-green m-0">{selectedBatch.score.split('/')[0]}<small style={{ fontSize: '1.5rem' }}>%</small></h1>
                                                <span className="badge rounded-pill bg-success bg-opacity-10 text-success px-3 py-2 mt-2">{selectedBatch.grade}</span>
                                            </div>

                                            <h6 className="fw-bold lpmpc-green mb-3 text-uppercase" style={{ fontSize: '0.75rem' }}>Detailed Metrics Breakdown</h6>

                                            <div className="vstack gap-3">
                                                {[
                                                    { label: 'Color / Luster', score: 94, desc: 'Light Ivory profile detected', icon: 'palette' },
                                                    { label: 'Cleanliness (Purity)', score: 96, desc: 'Minimal residual plant skin', icon: 'cleaning_services' },
                                                    { label: 'Texture / Softness', score: 91, desc: 'High degree of fiber pliability', icon: 'texture' }
                                                ].map((metric, i) => (
                                                    <div key={i} className="p-3 rounded-3 border">
                                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                                            <div className="d-flex align-items-center">
                                                                <span className="material-symbols-outlined lpmpc-green me-2" style={{ fontSize: '1.2rem' }}>{metric.icon}</span>
                                                                <span className="fw-bold lpmpc-green" style={{ fontSize: '0.85rem' }}>{metric.label}</span>
                                                            </div>
                                                            <span className="fw-bold" style={{ color: i === 1 ? 'var(--lpmpc-gold)' : 'var(--lpmpc-green)' }}>{metric.score}%</span>
                                                        </div>
                                                        <div className="progress rounded-pill mb-2" style={{ height: '6px' }}>
                                                            <div className="progress-bar" style={{ width: `${metric.score}%`, backgroundColor: i === 1 ? 'var(--lpmpc-gold)' : 'var(--lpmpc-green)' }}></div>
                                                        </div>
                                                        <p className="m-0 text-muted" style={{ fontSize: '0.7rem' }}>{metric.desc}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <button className="btn w-100 mt-4 py-2 fw-bold text-uppercase rounded-3" onClick={() => setSelectedBatch(null)} style={{ backgroundColor: 'var(--lpmpc-green)', color: 'white', fontSize: '0.8rem', border: 'none' }}>Close Report</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* [TAB 4] : LIVE ORDER TAB */}
                        <div className={`admin-tab-content ${activeTab !== 'v-order' ? 'd-none' : ''}`}>
                            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                                <div>
                                    <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">ORDER</h2>
                                    <p className="text-muted m-0 small">Production queue and fiber resource allocation</p>
                                </div>
                                <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                            </div>

                            <div className="row g-3 mb-5">
                                {[
                                    { label: 'Pending Requests', count: isLoading ? '...' : String(pendingCount).padStart(2, '0'), color: '#468432' },
                                    { label: 'In Production', count: isLoading ? '...' : String(productionCount).padStart(2, '0'), color: '#b59a00' },
                                    { label: 'Orders Completed', count: isLoading ? '...' : String(completedCount).padStart(2, '0'), color: '#6c757d' }
                                ].map((w, i) => (
                                    <div className="col-12 col-md-4" key={i}>
                                        <div className="p-4 bg-white border border-light shadow-sm h-100 rounded-0 border-bottom border-3" style={{ borderBottomColor: w.color }}>
                                            <div className="text-muted fw-bold text-uppercase mb-2" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>{w.label}</div>
                                            <h2 className="fw-bold m-0" style={{ fontSize: '32px', color: w.color }}>{w.count}</h2>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* DYNAMIC UNIFIED PENDING ORDERS QUEUE */}
                            <div className="mb-4 mt-5 border-start border-4 border-warning ps-3">
                                <h2 className="fw-bold m-0 text-uppercase" style={{ fontSize: '24px', letterSpacing: '1px', color: '#b59a00', fontFamily: "'Montserrat', sans-serif" }}>Pending Orders</h2>
                                <p className="text-muted m-0 small">Incoming order requests requiring fiber assessment and layout validation</p>
                            </div>

                            <div className="row g-4 mb-5">
                                {isLoading ? (
                                    <div className="text-center text-muted small w-100 py-3">Syncing market portal database cards...</div>
                                ) : cardPendingOrders.length > 0 ? (
                                    cardPendingOrders.map((order) => {
                                        const primaryItem = order.order_items?.[0] || {};
                                        const isSufficient = (primaryItem.stock_status || 'Sufficient') === 'Sufficient';

                                        let sizeUnits = [];
                                        if (Array.isArray(order.order_items)) {
                                            sizeUnits = order.order_items;
                                        } else if (primaryItem.measurements) {
                                            sizeUnits = [primaryItem];
                                        }

                                        const aggregateQty = order.order_items?.reduce((acc, curr) => acc + (curr.measurements?.qty || 1), 0) || 1;

                                        return (
                                            <div className="col-12" key={order.id}>
                                                <div className="card border-0 shadow-sm rounded-0 bg-white border-top border-4" style={{ borderColor: isSufficient ? '#468432' : '#dc3545' }}>
                                                    <div className="card-body p-0">
                                                        <div className="row g-0">

                                                            {/* DESIGN REFERENCE PREVIEW */}
                                                            <div className="col-md-2 bg-light d-flex align-items-center justify-content-center border-end border-light p-3 text-center">
                                                                <div>
                                                                    <div className="text-muted fw-bold mb-2" style={{ fontSize: '9px' }}>DESIGN REF</div>
                                                                    <img
                                                                        src={order.design_url || 'https://via.placeholder.com/150'}
                                                                        alt="Ref Layout"
                                                                        className="img-fluid border border-white shadow-sm mb-2"
                                                                        style={{ maxHeight: '120px', objectFit: 'cover' }}
                                                                    />
                                                                    <button className="btn btn-dark btn-sm rounded-0 w-100 fw-bold" style={{ fontSize: '9px' }}>VIEW FULL</button>
                                                                </div>
                                                            </div>

                                                            {/* CLIENT PROFILE & DETAILED SIZING MATRIX */}
                                                            <div className="col-md-7 p-4 border-end border-light">
                                                                <div className="d-flex justify-content-between mb-2">
                                                                    <span className="text-muted fw-bold small">REF: {order.id.slice(0, 8).toUpperCase()}</span>
                                                                    <span className="text-muted small">
                                                                        Ordered at: <b>{new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</b>
                                                                    </span>
                                                                </div>

                                                                <h5 className="fw-bold text-uppercase mb-1" style={{ fontSize: '18px', color: '#1e1e24' }}>{order.customer_name}</h5>
                                                                <div className="fw-bold mb-3 small d-flex justify-content-between" style={{ color: '#468432' }}>
                                                                    <span>{primaryItem.item_name || 'Market Item'}</span>
                                                                    <span className="text-muted">Total Qty: <b className="text-dark">{aggregateQty} Unit(s)</b></span>
                                                                </div>

                                                                <div className="table-responsive">
                                                                    <table className="table table-sm table-bordered mb-0" style={{ fontSize: '12px' }}>
                                                                        <thead className="bg-light text-center">
                                                                            <tr style={{ fontSize: '10px' }} className="text-muted">
                                                                                <th>UNIT / SET</th>
                                                                                <th>QTY</th>
                                                                                <th>BUST</th>
                                                                                <th>WAIST</th>
                                                                                <th>LENGTH</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="text-center">
                                                                            {sizeUnits.map((item, idx) => {
                                                                                const spec = item.measurements || {};
                                                                                return (
                                                                                    <tr key={item.id || idx}>
                                                                                        <td className="fw-bold bg-light">Unit #{idx + 1}</td>
                                                                                        <td>{spec.qty || 1}</td>
                                                                                        <td>{spec.bust ? `${spec.bust}"` : '—'}</td>
                                                                                        <td>{spec.waist ? `${spec.waist}"` : '—'}</td>
                                                                                        <td>{spec.length ? `${spec.length}"` : '—'}</td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>

                                                            {/* RESOURCE SPECIFICATIONS & BILLING METRICS */}
                                                            <div className="col-md-3 p-4 bg-white d-flex flex-column justify-content-between">
                                                                <div>
                                                                    <div className="text-muted fw-bold text-uppercase mb-2" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>Production Specs</div>
                                                                    <div className="d-flex justify-content-between small mb-1">
                                                                        <span className="text-muted">Fiber Class:</span>
                                                                        <span className="fw-bold">{primaryItem.fiber_type || 'PID-Prime'}</span>
                                                                    </div>
                                                                    <div className="d-flex justify-content-between small mb-2">
                                                                        <span className="text-muted">Required Weight:</span>
                                                                        <span className="fw-bold">{primaryItem.fiber_weight ? `${primaryItem.fiber_weight} kg` : '1.5 kg'}</span>
                                                                    </div>

                                                                    <div className="fw-bold text-end mt-2 small" style={{ color: isSufficient ? '#468432' : '#dc3545' }}>
                                                                        ● {(primaryItem.stock_status || 'Sufficient').toUpperCase()}
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <div className="mb-3 d-flex justify-content-between align-items-end border-top pt-2">
                                                                        <span className="text-muted fw-bold" style={{ fontSize: '10px' }}>TOTAL PRICE</span>
                                                                        <h3 className="fw-bold m-0" style={{ fontSize: '22px', color: '#468432' }}>
                                                                            ₱{Number(order.total_amount).toLocaleString()}
                                                                        </h3>
                                                                    </div>

                                                                    <div className="d-grid gap-2">
                                                                        <button
                                                                            onClick={() => handleApproveOrder(order.id)}
                                                                            className="btn btn-success btn-sm rounded-0 fw-bold py-2 text-uppercase"
                                                                            style={{ backgroundColor: '#468432', border: 'none', fontSize: '11px', letterSpacing: '0.5px' }}
                                                                        >
                                                                            Approve Order Set
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleRejectOrder(order.id)}
                                                                            className="btn btn-outline-secondary btn-sm rounded-0 fw-bold py-2 text-uppercase"
                                                                            style={{ fontSize: '11px', letterSpacing: '0.5px' }}
                                                                        >
                                                                            Reject Request
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center text-muted py-5 small w-100 bg-white border border-light shadow-sm mb-4">
                                        No pending order requests found in pipeline database sync.
                                    </div>
                                )}
                            </div>

                            {/* ACTIVE ORDER QUEUE GRID */}
                            <div className="card border-0 shadow-sm rounded-0 bg-white">
                                <div className="card-header bg-white py-3 border-bottom border-light">
                                    <h6 className="m-0 fw-bold lpmpc-green text-uppercase" style={{ letterSpacing: '0.5px' }}>Active Order Queue</h6>
                                </div>
                                <div className="card-body p-0">
                                    {isLoading ? (
                                        <div className="text-center p-5 text-muted small">Loading production records ledger...</div>
                                    ) : (
                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
                                                <thead className="bg-light text-uppercase text-muted" style={{ fontSize: '12px', fontWeight: '700' }}>
                                                    <tr>
                                                        <th className="ps-4 py-3">Order ID</th>
                                                        <th className="py-3">Customer / Item</th>
                                                        <th className="py-3">Fiber Specs</th>
                                                        <th className="py-3">Total Amount</th>
                                                        <th className="py-3">Real-Time Status</th>
                                                        <th className="text-center pe-4 py-3">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {tableQueueOrders.length > 0 ? (
                                                        tableQueueOrders.map((order) => {
                                                            const itemRow = order.order_items?.[0] || {};
                                                            return (
                                                                <tr key={order.id} className="border-bottom">
                                                                    <td className="ps-4 fw-bold text-dark py-3">
                                                                        LPMPC-2026-{order.id.slice(0, 3).toUpperCase()}
                                                                    </td>
                                                                    <td className="py-3">
                                                                        <div className="fw-bold text-uppercase text-dark" style={{ fontSize: '14px' }}>{order.customer_name}</div>
                                                                        <div className="text-muted small" style={{ fontSize: '13px' }}>{itemRow.item_name || "Custom Item"}</div>
                                                                    </td>
                                                                    <td className="py-3">
                                                                        <span className="badge bg-light text-secondary border rounded-pill px-3 py-2 fw-normal" style={{ fontSize: '12px' }}>
                                                                            {itemRow.fiber_type || 'PID-1'} ({itemRow.fiber_weight || '0.0'}kg)
                                                                        </span>
                                                                    </td>
                                                                    <td className="fw-bold text-success py-3" style={{ color: '#468432', fontSize: '14px' }}>
                                                                        ₱{Number(order.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td className="py-3">
                                                                        <select
                                                                            className="form-select form-select-sm fw-medium border-light-subtle rounded-2 shadow-none"
                                                                            value={order.order_status}
                                                                            onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                                                            style={{ fontSize: '13px', width: '160px', color: '#495057' }}
                                                                        >
                                                                            <option value="Confirmed">Confirmed</option>
                                                                            <option value="Weaving">Weaving</option>
                                                                            <option value="Shipping">Shipping</option>
                                                                            <option value="Received">Received</option>
                                                                        </select>
                                                                    </td>
                                                                    <td className="text-center pe-4 py-3">
                                                                        <div className="d-flex justify-content-center gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => handleViewDetails(e, order)}
                                                                                className="action-icon-btn text-icon-green"
                                                                                title="View details"
                                                                                style={{ background: 'none', border: 'none', padding: 0 }}
                                                                            >
                                                                                <span className="material-symbols-outlined align-middle" style={{ fontSize: '20px' }}>visibility</span>
                                                                            </button>

                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    if (e) {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                    }
                                                                                    handleRejectOrder(order.id);
                                                                                }}
                                                                                className="action-icon-btn text-icon-red"
                                                                                title="Cancel order"
                                                                                style={{ background: 'none', border: 'none', padding: 0 }}
                                                                            >
                                                                                <span className="material-symbols-outlined align-middle" style={{ fontSize: '20px' }}>cancel</span>
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    ) : (
                                                        <tr>
                                                            <td colSpan="6" className="text-center py-5 text-muted small">
                                                                No active approved queue list inside the tracking data ledger.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* [TAB 5] : SALES TAB SECTION */}
                        <div className={`admin-tab-content ${activeTab !== 'v-sales' ? 'd-none' : ''}`}>
                            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                                <div>
                                    <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">SALES RECORD</h2>
                                    <p className="text-muted m-0 small">Transaction history and revenue tracking.</p>
                                </div>
                                <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                            </div>

                            <div className="row g-3 mb-4">
                                {[
                                    { label: 'Total Revenue (Paid)', count: isLoading ? '...' : `₱${totalPaidAmount.toLocaleString()}`, color: '#468432' },
                                    { label: 'Pending Receivables', count: isLoading ? '...' : `₱${totalUnpaidAmount.toLocaleString()}`, color: '#b59a00' },
                                    { label: 'Total Orders', count: isLoading ? '...' : String(totalSalesOrdersCount).padStart(2, '0'), color: '#6c757d' }
                                ].map((w, i) => (
                                    <div className="col-12 col-sm-4" key={i}>
                                        <div className="p-4 bg-white border border-light shadow-sm h-100 rounded-0 border-bottom border-3" style={{ borderBottom: `3px solid ${w.color}` }}>
                                            <div className="text-muted fw-bold text-uppercase mb-2" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>{w.label}</div>
                                            <h2 className="fw-bold m-0" style={{ fontSize: '32px', color: w.color }}>{w.count}</h2>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3 border-bottom pb-2">
                                <div className="d-flex gap-1">
                                    <button
                                        onClick={() => setSalesView('paid')}
                                        className="btn btn-sm rounded-0 fw-bold text-uppercase px-3 py-2 border-0"
                                        style={{
                                            fontSize: '11px',
                                            backgroundColor: salesView === 'paid' ? '#468432' : '#f8f9fa',
                                            color: salesView === 'paid' ? '#fff' : '#6c757d',
                                            transition: '0.3s'
                                        }}>
                                        Paid Transactions
                                    </button>
                                    <button
                                        onClick={() => setSalesView('unpaid')}
                                        className="btn btn-sm rounded-0 fw-bold text-uppercase px-3 py-2 border-0"
                                        style={{
                                            fontSize: '11px',
                                            backgroundColor: salesView === 'unpaid' ? '#b59a00' : '#f8f9fa',
                                            color: salesView === 'unpaid' ? '#fff' : '#6c757d',
                                            transition: '0.3s'
                                        }}>
                                        Unpaid / Pending
                                    </button>
                                </div>

                                <div className="d-flex gap-2">
                                    <select className="form-select form-select-sm rounded-0 shadow-none border-secondary-subtle" style={{ width: '130px', fontSize: '11px' }}>
                                        <option>MAY 2026</option>
                                    </select>
                                    <button className="btn btn-sm btn-outline-success rounded-0 text-uppercase fw-bold" style={{ fontSize: '11px', borderColor: '#468432', color: '#468432' }}>
                                        Export
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white border shadow-sm rounded-0 overflow-hidden">
                                {salesView === 'paid' ? (
                                    <div className="animate__animated animate__fadeIn">
                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
                                                <thead className="bg-light text-muted" style={{ fontSize: '11px' }}>
                                                    <tr>
                                                        <th className="py-3 px-4 border-0">Order ID</th>
                                                        <th className="py-3 border-0">Date</th>
                                                        <th className="py-3 border-0">Customer</th>
                                                        <th className="py-3 text-end px-4 border-0">Amount Paid</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {isLoading ? (
                                                        <tr>
                                                            <td colSpan="4" className="text-center py-4 text-muted small">Loading transactions...</td>
                                                        </tr>
                                                    ) : paidOrders.length > 0 ? (
                                                        paidOrders.map((sale) => (
                                                            <tr key={sale.id} className="border-bottom">
                                                                <td className="fw-bold px-4 py-3">LPMPC-2026-{sale.id.slice(0, 3).toUpperCase()}</td>
                                                                <td className="text-muted">{new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</td>
                                                                <td>{sale.customer_name}</td>
                                                                <td className="text-end fw-bold px-4 py-3 text-success" style={{ color: '#468432' }}>₱{Number(sale.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan="4" className="text-center py-4 text-muted small">No paid transactions recorded.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="p-3 text-end bg-light border-top">
                                            <small className="text-muted text-uppercase fw-bold me-2" style={{ fontSize: '10px' }}>Subtotal (Paid):</small>
                                            <span className="fw-bold fs-5" style={{ color: '#468432' }}>₱{totalPaidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="animate__animated animate__fadeIn">
                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
                                                <thead className="bg-light text-muted" style={{ fontSize: '11px' }}>
                                                    <tr>
                                                        <th className="py-3 px-4 border-0">Order ID</th>
                                                        <th className="py-3 border-0">Date</th>
                                                        <th className="py-3 border-0">Customer</th>
                                                        <th className="py-3 border-0">Status</th>
                                                        <th className="py-3 text-end px-4 border-0">Balance Due</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {isLoading ? (
                                                        <tr>
                                                            <td colSpan="5" className="text-center py-4 text-muted small">Loading transactions...</td>
                                                        </tr>
                                                    ) : unpaidOrders.length > 0 ? (
                                                        unpaidOrders.map((sale) => (
                                                            <tr key={sale.id} className="border-bottom">
                                                                <td className="fw-bold px-4 py-3">LPMPC-2026-{sale.id.slice(0, 3).toUpperCase()}</td>
                                                                <td className="text-muted">{new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</td>
                                                                <td>{sale.customer_name}</td>
                                                                <td>
                                                                    <span className="badge rounded-pill fw-normal border px-3" style={{ backgroundColor: '#fff9e6', color: '#b59a00', borderColor: '#ffeeba' }}>
                                                                        {sale.order_status}
                                                                    </span>
                                                                </td>
                                                                <td className="text-end fw-bold px-4 py-3 text-danger">₱{Number(sale.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan="5" className="text-center py-4 text-muted small">No unpaid transactions pending.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="p-3 text-end bg-light border-top">
                                            <small className="text-muted text-uppercase fw-bold me-2" style={{ fontSize: '10px' }}>Total Unpaid:</small>
                                            <span className="fw-bold text-danger fs-5">₱{totalUnpaidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </main>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                 @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap');
                 .lpmpc-green { color: #468432 !important; }
                 .bg-lpmpc-green { background-color: #468432 !important; }
                 .card { transition: transform 0.2s ease; }
                 .card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important; }
                 .btn:disabled { opacity: 0.5; cursor: not-allowed; }
                 .text-lpmpc { color: #468432; }
                 .table-sm td, .table-sm th { padding: 0.5rem; }

                 /* Vis Timeline CSS Custom Styling rules targeting element node colors */
                 .vis-item.bar-veg {
                      background-color: #28a745 !important;
                      border-color: #1e7e34 !important;
                      color: #ffffff !important;
                      font-weight: bold !important;
                  }

                  .vis-item.bar-flow {
                      background-color: #e83e8c !important;
                      border-color: #d63384 !important;
                      color: #ffffff !important;
                  }

                 .vis-item.bar-maturation {
                     background-color: #ffc107 !important;
                     border-color: #d39e00 !important;
                     color: #000000 !important;
                     font-weight: bold !important;
                 }
                 .vis-item {
                     border-radius: 4px !important;
                     padding: 6px !important;
                     font-size: 13px !important;
                 }
                 .vis-label {
                     font-weight: 600 !important;
                     color: #212529 !important;
                 }
            `}} />

            {/* REAL-TIME PRODUCTION ORDER DETAILS MODAL (POPUP) */}
            <div className="modal fade" id="orderDetailModal" tabIndex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div className="modal-dialog modal-lg modal-dialog-centered">
                    <div className="modal-content rounded-0 border-0 shadow">
                        <div className="modal-header bg-lpmpc-green text-white rounded-0 py-3 px-4 d-flex justify-content-between align-items-center">
                            <div>
                                <h5 className="modal-title fw-bold text-uppercase m-0" style={{ fontSize: '16px', letterSpacing: '0.5px', fontFamily: "'Montserrat', sans-serif" }}>
                                    Production Specifications Ledger
                                </h5>
                                {selectedOrder && (
                                    <small className="text-white-50 small">
                                        Tracking ID: LPMPC-2026-{selectedOrder.id.slice(0, 3).toUpperCase()}
                                    </small>
                                )}
                            </div>
                            <button type="button" className="btn-close btn-close-white shadow-none" data-bs-dismiss="modal" aria-label="Close" onClick={() => setSelectedOrder(null)}></button>
                        </div>

                        <div className="modal-body p-4 bg-light">
                            {selectedOrder ? (
                                <div className="container-fluid p-0">
                                    <div className="row g-4">
                                        <div className="col-md-4 text-center">
                                            <div className="card border-0 rounded-0 shadow-sm p-3 bg-white h-100 d-flex flex-column justify-content-between">
                                                <div>
                                                    <span className="text-muted fw-bold d-block mb-2 text-uppercase" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>
                                                        Design Layout BluePrint
                                                    </span>
                                                    <div className="border border-light p-2 bg-light d-flex align-items-center justify-content-center" style={{ minHeight: '160px' }}>
                                                        <img
                                                            src={selectedOrder.design_url || 'https://via.placeholder.com/200x250?text=No+Design+Uploaded'}
                                                            alt="Tailoring Reference"
                                                            className="img-fluid border border-white shadow-sm"
                                                            style={{ maxHeight: '200px', objectFit: 'contain' }}
                                                        />
                                                    </div>
                                                </div>
                                                {selectedOrder.design_url && (
                                                    <a href={selectedOrder.design_url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-dark rounded-0 fw-bold w-100 mt-3" style={{ fontSize: '11px' }}>
                                                        VIEW FULL RES IMAGE
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        <div className="col-md-8">
                                            <div className="d-flex flex-column gap-3">
                                                <div className="card border-0 rounded-0 shadow-sm p-3 bg-white">
                                                    <h6 className="fw-bold text-uppercase mb-3 pb-2 border-bottom text-dark" style={{ fontSize: '13px' }}>
                                                        Customer Logistics & Contact Profile
                                                    </h6>
                                                    <div className="row g-2" style={{ fontSize: '13px' }}>
                                                        <div className="col-4 text-muted">Customer Name:</div>
                                                        <div className="col-8 fw-bold text-uppercase text-dark">{selectedOrder.customer_name}</div>

                                                        <div className="col-4 text-muted">Contact Number:</div>
                                                        <div className="col-8 fw-medium">{selectedOrder.contact_no || 'No Contact Provided'}</div>

                                                        <div className="col-4 text-muted">Shipping Address:</div>
                                                        <div className="col-8 text-secondary fw-normal">{selectedOrder.shipping_address || 'No Address Logged'}</div>

                                                        <div className="col-4 text-muted">Delivery Method:</div>
                                                        <div className="col-8"><span className="badge bg-light text-dark border fw-semibold">{selectedOrder.delivery_method || 'Standard'}</span></div>
                                                    </div>
                                                </div>

                                                <div className="card border-0 rounded-0 shadow-sm p-3 bg-white">
                                                    <h6 className="fw-bold text-uppercase mb-2 pb-2 border-bottom text-dark" style={{ fontSize: '13px' }}>
                                                        Fiber Evaluation Specifications
                                                    </h6>
                                                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ fontSize: '13px' }}>
                                                        <span className="text-muted">Target Core Item Type:</span>
                                                        <span className="fw-bold text-uppercase text-dark">{selectedOrder.order_items?.[0]?.item_name || 'Custom Marketplace Asset'}</span>
                                                    </div>
                                                    <div className="d-flex justify-content-between align-items-center" style={{ fontSize: '13px' }}>
                                                        <span className="text-muted">Fiber Class / Raw Weight Allocation:</span>
                                                        <span className="fw-bold text-success">
                                                            {selectedOrder.order_items?.[0]?.fiber_type || 'PID-Prime'} ({selectedOrder.order_items?.[0]?.fiber_weight || '0.0'} kg)
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-12">
                                            <div className="card border-0 rounded-0 shadow-sm p-3 bg-white">
                                                <h6 className="fw-bold text-uppercase mb-3 pb-2 border-bottom text-dark" style={{ fontSize: '13px' }}>
                                                    Tailoring Dimensional Sizing Matrix
                                                </h6>
                                                <div className="table-responsive">
                                                    <table className="table table-sm table-bordered mb-0 align-middle" style={{ fontSize: '12px' }}>
                                                        <thead className="bg-light text-center text-muted text-uppercase" style={{ fontSize: '10px' }}>
                                                            <tr>
                                                                <th style={{ width: '15%' }}>Unit Set</th>
                                                                <th>Quantity Order</th>
                                                                <th>Bust Dimension</th>
                                                                <th>Waist Dimension</th>
                                                                <th>Length Dimension</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="text-center">
                                                            {selectedOrder.order_items && selectedOrder.order_items.length > 0 ? (
                                                                selectedOrder.order_items.map((item, idx) => {
                                                                    const specs = item.measurements || {};
                                                                    return (
                                                                        <tr key={item.id || idx}>
                                                                            <td className="fw-bold bg-light py-2">Unit #{idx + 1}</td>
                                                                            <td>{specs.qty || 1}</td>
                                                                            <td className="fw-semibold text-dark">{specs.bust ? `${specs.bust}"` : '—'}</td>
                                                                            <td className="fw-semibold text-dark">{specs.waist ? `${specs.waist}"` : '—'}</td>
                                                                            <td className="fw-semibold text-dark">{specs.length ? `${specs.length}"` : '—'}</td>
                                                                        </tr>
                                                                    );
                                                                })
                                                            ) : (
                                                                <tr>
                                                                    <td colSpan="5" className="text-center py-2 text-muted italic">
                                                                        No specific dimension attributes mapped to this item configuration.
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {selectedOrder.special_notes && (
                                                    <div className="mt-3 bg-light p-2 border border-light-subtle" style={{ fontSize: '12px' }}>
                                                        <b className="text-uppercase text-muted d-block mb-1" style={{ fontSize: '10px' }}>Special Instructions / Client Notes:</b>
                                                        <span className="text-dark fw-medium">"{selectedOrder.special_notes}"</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-4 text-muted small">
                                    No active entry selected for profiling.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="modal fade" id="addFarmerModal" tabIndex="-1">
                <div className="modal-dialog">
                    <div className="modal-content rounded-0">
                        <div className="modal-header bg-light">
                            <h5 className="modal-title fw-bold text-uppercase lpmpc-green">Register New Farmer</h5>
                            <button type="button" className="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div className="modal-body">
                            <form id="addFarmerForm" onSubmit={handleCreateFarmer}>
                                <div className="mb-2">
                                    <label className="small fw-bold text-muted">FULL NAME</label>
                                    <input type="text" name="fullName" className="form-control rounded-0" required />
                                </div>
                                <div className="mb-2">
                                    <label className="small fw-bold text-muted">EMAIL</label>
                                    <input type="email" name="email" className="form-control rounded-0" required />
                                </div>
                                <div className="mb-2">
                                    <label className="small fw-bold text-muted">ADDRESS</label>
                                    <input type="text" name="address" className="form-control rounded-0" required />
                                </div>
                                <div className="mb-2">
                                    <label className="small fw-bold text-muted">FARM NAME</label>
                                    <input type="text" name="farmName" className="form-control rounded-0" required />
                                </div>
                                <div className="mb-3">
                                    <label className="small fw-bold text-muted">CONTACT NUMBER</label>
                                    <input type="text" name="contactNo" className="form-control rounded-0" required />
                                </div>
                                <div className="mb-3">
                                    <label className="small fw-bold text-muted">PASSWORD</label>
                                    <input type="password" name="password" className="form-control rounded-0" required />
                                </div>
                                <button type="submit" className="btn w-100 rounded-0 text-white fw-bold" style={{ backgroundColor: '#468432' }}>
                                    CREATE ACCOUNT
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>


        </div>
    );
};

export default AdminDashboard;