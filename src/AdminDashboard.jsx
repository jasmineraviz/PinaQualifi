import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import { createClient } from '@supabase/supabase-js';
import emailjs from '@emailjs/browser';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

Chart.register(...registerables);

const supabaseUrl = 'https://bqblzvgwkvdkanobntgn.supabase.co';
const supabaseKey = 'sb_publishable_cKKlFv0eCaArfywT-fqzaQ_QEXrLLbm';
const supabase = createClient(supabaseUrl, supabaseKey);

const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('v-dash');
    const [dateStr, setDateStr] = useState('');
    const [salesView, setSalesView] = useState('paid');
    const [bastosChartData, setBastosChartData] = useState({ labels: [], values: [] });

    // STATE FOR DYNAMIC INVENTORY & FARMS FROM SUPABASE
    const [farms, setFarms] = useState([]);
    const [isFarmsLoading, setIsFarmsLoading] = useState(true);
    const [inventoryStock, setInventoryStock] = useState([]);
    const [recentScannedBatches, setRecentScannedBatches] = useState([]);
    const [isInventoryLoading, setIsInventoryLoading] = useState(true);

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
    const cardPendingOrders = supabaseOrders.filter(o => o.order_status === 'Pending' || o.order_status === 'Pending Farmer Sourcing');
    const tableQueueOrders = supabaseOrders.filter(o =>
        o.order_status !== 'Pending' &&
        o.order_status !== 'Pending Farmer Sourcing' &&
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
    const productionCount = supabaseOrders.filter(o => o.order_status === 'Processing' || o.order_status === 'Confirmed').length;
    const completedCount = supabaseOrders.filter(o => o.order_status === 'Received' || o.order_status === 'In Transit').length;

    // FETCHES ORDERS FROM DATABASE
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

    // FETCH DYNAMIC INVENTORY & LOGS FROM SUPABASE (WITH PID-R / RESIDUAL PARSING)
    const fetchBastosInventory = async () => {
        try {
            setIsInventoryLoading(true);
            const { data, error } = await supabase
                .from('bastos_logs')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data) {
                // 1. Calculate live weight balances per PID Grade
                const gradeWeights = {
                    'PID-1': 0,
                    'PID-2': 0,
                    'PID-3': 0,
                    'PID-4': 0,
                    'PID-R': 0
                };

                data.forEach((row) => {
                    let rawGrade = row.grade ? row.grade.trim().toUpperCase() : '';
                    let gradeKey = 'PID-R'; // Fallback default

                    if (rawGrade.includes('PID-1')) gradeKey = 'PID-1';
                    else if (rawGrade.includes('PID-2')) gradeKey = 'PID-2';
                    else if (rawGrade.includes('PID-3')) gradeKey = 'PID-3';
                    else if (rawGrade.includes('PID-4')) gradeKey = 'PID-4';
                    else if (rawGrade.includes('PID-R') || rawGrade.includes('RESIDUAL')) gradeKey = 'PID-R';

                    const bundleWeight = Number(row.weight || row.fiber_weight) || 0.5;
                    gradeWeights[gradeKey] += bundleWeight;
                });

                // 2. Build Dynamic Stock Ledger Array for PID-1 through PID-R
                const gradeMetadata = [
                    { id: 'PID-1', name: 'PID-1' },
                    { id: 'PID-2', name: 'PID-2' },
                    { id: 'PID-3', name: 'PID-3' },
                    { id: 'PID-4', name: 'PID-4' },
                    { id: 'PID-R', name: 'PID-R' }
                ];

                const dynamicStockLedger = gradeMetadata.map(item => {
                    const weightKg = gradeWeights[item.id] || 0;
                    let status = 'Optimal';
                    if (weightKg === 0) status = 'Out of Stock';
                    else if (weightKg < 20) status = 'Low Stock';

                    return {
                        id: item.id,
                        name: item.name,
                        stockKg: weightKg,
                        price: '₱650.00 / kg',
                        status: status,
                        score: item.id === 'PID-1' ? '95/100' : item.id === 'PID-2' ? '88/100' : item.id === 'PID-3' ? '80/100' : item.id === 'PID-4' ? '75/100' : '70/100'
                    };
                });

                setInventoryStock(dynamicStockLedger);

                // 3. Update Chart Dataset values (5-part wheel)
                const labels = ['PID-1', 'PID-2', 'PID-3', 'PID-4', 'PID-R'];
                const values = labels.map(g => gradeWeights[g] || 0);
                setBastosChartData({ labels, values });

                // 4. Set Recent Scanned Batches from Top 5 Scanned Logs
                const recentLogs = data.slice(0, 5).map((log, idx) => {
                    let rawGrade = log.grade ? log.grade.trim().toUpperCase() : 'PID-R';
                    let cleanGrade = rawGrade;
                    if (rawGrade.includes('PID-R') || rawGrade.includes('RESIDUAL')) cleanGrade = 'PID-R';

                    return {
                        id: log.batch_id || `BAT-2026-${String(log.id || idx + 1).padStart(3, '0')}`,
                        grade: cleanGrade,
                        score: log.score ? `${log.score}/100` : '92/100',
                        timestamp: log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'
                    };
                });
                setRecentScannedBatches(recentLogs);
            }
        } catch (error) {
            console.error('Error fetching dynamic inventory from bastos_logs:', error.message);
        } finally {
            setIsInventoryLoading(false);
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

            uniqueFarms.push({
                id: groupId,
                content: farm.farm_name
            });

            const phaseName = farm.status_name || 'Vegetative';
            const statusKey = phaseName.toLowerCase();

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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bastos_logs' }, () => {
                fetchBastosInventory();
            })
            .subscribe();

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

    // AUTOMATED APPROVE/SOURCING/REJECT LOGIC
    const handleApproveOrder = async (order) => {
        const primaryItem = order.order_items?.[0] || {};
        let orderedGrade = primaryItem.fiber_type ? primaryItem.fiber_type.trim().toUpperCase() : 'PID-1';
        if (orderedGrade.includes('PID-R') || orderedGrade.includes('RESIDUAL')) orderedGrade = 'PID-R';

        const orderedWeight = Number(primaryItem.fiber_weight) || 1.0;

        // Check Warehouse Inventory from live database state
        const targetStock = inventoryStock.find(item => item.id === orderedGrade);
        const availableWarehouseKg = targetStock ? targetStock.stockKg : 0;

        if (availableWarehouseKg >= orderedWeight) {
            // Sufficient Warehouse Stock
            try {
                const { error } = await supabase
                    .from('orders')
                    .update({ order_status: 'Confirmed' })
                    .eq('id', order.id);

                if (error) throw error;
                alert(`Order APPROVED! Warehouse stock allocated (${availableWarehouseKg} kg available).`);
            } catch (error) {
                alert("Error approving order: " + error.message);
            }
        } else {
            // Deficit: Check Registered Farm Sourcing Timelines
            const availableFarms = farms.filter(f =>
                (f.status_name === 'Harvesting' || f.status_name === 'Maturation')
            );

            if (availableFarms.length > 0) {
                // Farms Available: Route to Leaf Outsourcing
                try {
                    const { error } = await supabase
                        .from('orders')
                        .update({ order_status: 'Pending Farmer Sourcing' })
                        .eq('id', order.id);

                    if (error) throw error;
                    alert(`Stock Deficit (${availableWarehouseKg} kg in stock vs ${orderedWeight} kg requested). Order routed to Leaf Outsourcing from ${availableFarms.length} active prospect farm(s).`);
                } catch (error) {
                    alert("Error processing sourcing route: " + error.message);
                }
            } else {
                // AUTOMATED ORDER REJECTION PROTOCOL
                alert(`AUTOMATED ORDER REJECTION PROTOCOL TRIGGERED!\n\nReason: Warehouse inventory is deficient (${availableWarehouseKg} kg) and NO registered farms currently have harvestable leaves available.`);

                try {
                    const { error } = await supabase
                        .from('orders')
                        .update({ order_status: 'Rejected' })
                        .eq('id', order.id);

                    if (error) throw error;
                } catch (error) {
                    alert("Error updating rejection status: " + error.message);
                }
            }
        }
    };

    // MANUAL REJECT ORDER
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

        // DOUGHNUT CHART (THE WHEEL WITH PID-1 to PID-R)
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
                                padding: 15,
                                font: { family: "'Montserrat', sans-serif", size: 11, weight: '600' },
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
            const innerText = group.content.replace(/<[^>]*>/g, '').toLowerCase();
            const isVisible = innerText.indexOf(val) !== -1;
            groups.current.update({ id: group.id, visible: isVisible });
        });
    };

    const handleCreateFarmer = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        let cleanContact = data.contactNo.replace(/\D/g, '');

        if (cleanContact.startsWith('9') && cleanContact.length === 10) {
            cleanContact = '63' + cleanContact;
        } else {
            alert("Validation Error: Mobile entry must be exactly 10 digits and start with 9.");
            return;
        }

        const latVal = parseFloat(document.getElementById('farmer-lat').value);
        const lngVal = parseFloat(document.getElementById('farmer-lng').value);

        try {
            const currentYearPrefix = new Date().getFullYear().toString().slice(-2);

            const { data: idSequenceData, error: idSequenceError } = await supabase
                .from('users')
                .select('farmer_id')
                .eq('role', 'farmer')
                .like('farmer_id', `${currentYearPrefix}-%`);

            if (idSequenceError) throw idSequenceError;

            const nextCount = (idSequenceData ? idSequenceData.length : 0) + 1;
            const autoGeneratedFarmerId = `${currentYearPrefix}-${nextCount.toString().padStart(4, '0')}`;

            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: data.email,
                password: data.password,
                options: { data: { full_name: data.fullName } }
            });

            if (authError) throw authError;

            const { error: dbError } = await supabase.from('users').insert([
                {
                    id: authData.user.id,
                    farmer_id: autoGeneratedFarmerId,
                    full_name: data.fullName,
                    email: data.email,
                    address: data.address,
                    farm_name: data.farmName,
                    contact_no: cleanContact,
                    role: 'farmer',
                    latitude: latVal,
                    longitude: lngVal
                }
            ]);

            if (dbError) throw dbError;

            try {
                const smsMessage = `Hi ${data.fullName}, your LPMPC Farmer account has been successfully created! Please check your email (${data.email}) for your login credentials. - LPMPC PinaQualify`;
                const smsBody = new URLSearchParams({
                    apikey: '3d81194ec2cf0d9b33c8221724d35887',
                    number: cleanContact,
                    message: smsMessage
                });

                await fetch('/api/semaphore/api/v4/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: smsBody.toString()
                });
            } catch (smsErr) {
                console.warn('SMS notification failed:', smsErr.message);
            }

            try {
                await emailjs.send('service_bxxlbqj', 'template_bs6zso6', {
                    email: data.email,
                    farmer_name: data.fullName,
                    farmer_email: data.email,
                    temp_password: data.password
                }, '80xVnHaUIC6d2lJ5l');
            } catch (emailErr) {
                console.warn('Email notification failed:', emailErr);
            }

            alert(`Farmer account created successfully! System Assigned ID: ${autoGeneratedFarmerId}`);
            document.querySelector('[data-bs-dismiss="modal"]').click();
            e.target.reset();
        } catch (err) {
            alert("Error: " + err.message);
        }
    };

    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const geocoderInstanceRef = useRef(null);

    useEffect(() => {
        const modalEl = document.getElementById('addFarmerModal');

        const initMap = () => {
            if (mapRef.current) return;

            mapRef.current = window.L.map('farmer-map').setView([14.1369, 122.9813], 14);
            window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);

            markerRef.current = window.L.marker([14.1369, 122.9813], { draggable: true }).addTo(mapRef.current);

            document.getElementById('farmer-lat').value = 14.1369;
            document.getElementById('farmer-lng').value = 122.9813;

            const reverseGeocode = async (lat, lng) => {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                    const data = await res.json();
                    if (data && data.display_name) {
                        document.getElementById('farmer-address').value = data.display_name;
                    }
                } catch (err) {
                    console.error("Error reverse geocoding:", err);
                }
            };

            markerRef.current.on('dragend', async () => {
                const position = markerRef.current.getLatLng();
                document.getElementById('farmer-lat').value = position.lat;
                document.getElementById('farmer-lng').value = position.lng;
                await reverseGeocode(position.lat, position.lng);
            });

            if (window.L.Control.Geocoder) {
                geocoderInstanceRef.current = window.L.Control.geocoder({
                    defaultMarkGeocode: false
                }).addTo(mapRef.current);

                geocoderInstanceRef.current.on('markgeocode', function (e) {
                    const latlng = e.geocode.center;
                    const addressName = e.geocode.name;

                    mapRef.current.setView(latlng, 16);
                    markerRef.current.setLatLng(latlng);

                    document.getElementById('farmer-lat').value = latlng.lat;
                    document.getElementById('farmer-lng').value = latlng.lng;
                    document.getElementById('farmer-address').value = addressName;
                });
            }
        };

        const onShow = () => {
            setTimeout(() => {
                initMap();
                if (mapRef.current) {
                    mapRef.current.invalidateSize();
                }
            }, 300);
        };

        modalEl.addEventListener('shown.bs.modal', onShow);
        return () => modalEl.removeEventListener('shown.bs.modal', onShow);
    }, []);

    const handleAddressKeyDown = async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();

            const queryText = e.target.value.trim();
            if (!queryText) return;

            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryText)}&limit=1`);
                const results = await response.json();

                if (results && results.length > 0) {
                    const firstResult = results[0];
                    const lat = parseFloat(firstResult.lat);
                    const lng = parseFloat(firstResult.lon);
                    const latlng = [lat, lng];

                    if (mapRef.current) {
                        mapRef.current.setView(latlng, 16);
                    }

                    if (markerRef.current) {
                        markerRef.current.setLatLng(latlng);
                    }

                    document.getElementById('farmer-lat').value = lat;
                    document.getElementById('farmer-lng').value = lng;

                    document.getElementById('farmer-address').value = firstResult.display_name;

                } else {
                    alert("Can't find location. Try again or put the specific address.");
                }
            } catch (err) {
                console.error("Error searching address via Nominatim:", err);
                alert("Error finding location. Try again.");
            }
        }
    };

    return (
        <div className="admin-layout admin-layout-wrapper">
            <div className="container-fluid p-0">
                <div className="row g-0">

                    {/* SIDE NAVIGATION LAYOUT */}
                    <nav className="col-md-3 col-lg-2 bg-lpmpc-green vh-100 position-fixed shadow-sm">
                        <div className="p-4 border-bottom border-white border-opacity-25">
                            <h4 className="fw-bold m-0 text-gold">LPMPC Admin</h4>
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
                                <span className="material-symbols-outlined">shopping_bag</span> ORDERS
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
                                    { label: 'Total Sales Revenue', count: isLoading ? '...' : `₱${totalPaidAmount.toLocaleString()}`, color: '#468432' },
                                    { label: 'Registered Prospect Farms', count: isFarmsLoading ? '...' : farms.length, color: '#b59a00' },
                                    { label: 'Total Fiber Orders', count: isLoading ? '...' : supabaseOrders.length, color: '#6c757d' }
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
                                            <h6 className="fw-bold text-uppercase m-0 lpmpc-green" style={{ fontSize: '0.85rem' }}>Sales Revenue (Monthly)</h6>
                                        </div>
                                        <div className="flex-grow-1" style={{ position: 'relative', height: '100%' }}>
                                            <canvas ref={salesChartCanvas}></canvas>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-12 col-lg-5">
                                    <div className="card border-0 rounded-4 p-3 p-md-4 shadow-sm bg-white h-100" style={{ minHeight: '300px' }}>
                                        <h6 className="fw-bold text-uppercase mb-4 lpmpc-green" style={{ fontSize: '0.85rem' }}>Fiber Inventory Distribution</h6>
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
                                    <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">FARM SOURCING MANAGEMENT</h2>
                                    <p className="text-muted m-0 small">Tracking Queen Pineapple crop growth and harvest timelines</p>
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
                                    <h5 className="fw-bold m-0 small text-uppercase">Active Prospect Farms</h5>
                                </div>
                                <div className="table-responsive">
                                    <table className="table table-hover align-middle mb-0" style={{ minWidth: '700px' }}>
                                        <thead className="table-light text-uppercase small fw-bold">
                                            <tr>
                                                <th className="ps-4">Batch ID</th>
                                                <th>Farm Name</th>
                                                <th>Owner / Contact</th>
                                                <th className="d-none d-md-table-cell">Contact Number</th>
                                                <th>Status</th>
                                                <th style={{ width: '150px' }}>Progress</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isFarmsLoading ? (
                                                <tr><td colSpan="6" className="text-center">Syncing farm database...</td></tr>
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
                                                        <td className="ps-4 fw-bold">{farm.batch_id}</td>
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
                                    backgroundColor: '#468432',
                                    color: '#ffffff',
                                    fontSize: '24px'
                                }}
                                data-bs-toggle="modal"
                                data-bs-target="#addFarmerModal"
                            >
                                +
                            </button>

                        </div>

                        {/* [TAB 3] : INVENTORY TAB LAYOUT (PID-1 to PID-R) */}
                        <div className={`admin-tab-content ${activeTab !== 'v-inv' ? 'd-none' : ''}`}>
                            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                                <div>
                                    <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">Decorticated Fiber Inventory</h2>
                                    <p className="text-muted m-0 small">PNS/BAFS 318:2021 Automated Visual Grading & Stock Ledger</p>
                                </div>
                                <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                            </div>

                            <div className="row g-4 mb-4">
                                {/* ROBOTICS SCANNER WIDGET */}
                                <div className="col-12 col-lg-5">
                                    <div className="card border-0 rounded-4 p-3 p-md-4 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #f8fcf7 0%, #ffffff 100%)', border: '1px solid #e1eedd !important' }}>
                                        <div className="d-flex justify-content-between align-items-start mb-4">
                                            <div>
                                                <h6 className="fw-bold text-uppercase m-0 lpmpc-green" style={{ fontSize: '0.85rem' }}>Robotics Optical Scanner</h6>
                                                <small className="text-muted" style={{ fontSize: '0.7rem' }}>Piña-QualiFi Conveyor Unit #1</small>
                                            </div>
                                            <span className="badge rounded-pill pulse px-2 py-2" style={{ backgroundColor: 'var(--lpmpc-light-yellow)', color: 'var(--lpmpc-green)', border: '1px solid var(--lpmpc-green)', fontSize: '0.6rem' }}>
                                                ● LIVE GRADING ANALYSIS
                                            </span>
                                        </div>

                                        <div className="flex-grow-1 d-flex flex-column justify-content-center p-3 rounded-4 mb-3" style={{ backgroundColor: '#ffffff', border: '1px solid #e1eedd' }}>
                                            <div className="text-center mb-3">
                                                <span className="material-symbols-outlined lpmpc-green opacity-25" style={{ fontSize: '2rem' }}>precision_manufacturing</span>
                                                <div className="d-flex align-items-center justify-content-center mt-1">
                                                    <span className="material-symbols-outlined lpmpc-green me-2" style={{ fontSize: '1rem' }}>visibility</span>
                                                    <p className="fw-bold lpmpc-green mb-0" style={{ fontSize: '0.75rem' }}>Visual Sensor Array Active</p>
                                                </div>
                                            </div>

                                            <div className="w-100 px-1">
                                                {[{ l: 'Color Spectrum', v: '94%' }, { l: 'Purity / Cleanliness', v: '88%' }, { l: 'Surface Texture', v: '91%' }].map((m, i) => (
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
                                    </div>
                                </div>

                                {/* RECENT SCANNED BATCHES TABLE */}
                                <div className="col-12 col-lg-7">
                                    <div className="card border-0 rounded-4 p-3 p-md-4 shadow-sm bg-white h-100">
                                        <h6 className="fw-bold text-uppercase mb-4 lpmpc-green" style={{ fontSize: '0.85rem' }}>Recent Scanned Fiber Batches</h6>
                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle mb-0" style={{ minWidth: '400px' }}>
                                                <thead>
                                                    <tr className="text-muted text-uppercase small border-bottom" style={{ fontSize: '0.7rem' }}>
                                                        <th className="pb-3">Batch ID</th>
                                                        <th className="pb-3 text-center">Grade</th>
                                                        <th className="pb-3 text-center">Score</th>
                                                        <th className="pb-3 text-end">Logged Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody style={{ fontSize: '0.8rem' }}>
                                                    {isInventoryLoading ? (
                                                        <tr><td colSpan="4" className="text-center py-3">Syncing scanner logs...</td></tr>
                                                    ) : recentScannedBatches.length > 0 ? (
                                                        recentScannedBatches.map((batch, idx) => (
                                                            <tr key={idx} className="border-bottom" style={{ cursor: 'pointer' }} onClick={() => setSelectedBatch(batch)}>
                                                                <td className="py-3 fw-bold lpmpc-green">{batch.id}</td>
                                                                <td className="text-center">
                                                                    <span className="badge rounded-pill bg-success bg-opacity-10 text-success fw-bold" style={{ fontSize: '0.65rem' }}>{batch.grade}</span>
                                                                </td>
                                                                <td className="text-center fw-bold text-muted">{batch.score}</td>
                                                                <td className="text-end text-muted small">{batch.timestamp}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr><td colSpan="4" className="text-center py-3 text-muted">No recent conveyor scans logged.</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                                {/* DYNAMIC FIBER STOCK LEDGER TABLE (PID-1 through PID-R) */}
                                <div className="col-12">
                                    <div className="card border-0 rounded-4 p-3 p-md-4 shadow-sm bg-white mt-2">
                                        <div className="d-flex justify-content-between align-items-center mb-4">
                                            <div>
                                                <h6 className="fw-bold text-uppercase m-0 lpmpc-green" style={{ fontSize: '0.85rem' }}>Decorticated Fiber Stock Ledger</h6>
                                                <small className="text-muted" style={{ fontSize: '0.75rem' }}>Live warehouse stock balances queried directly from database logs</small>
                                            </div>
                                        </div>

                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle mb-0">
                                                <thead className="bg-light">
                                                    <tr className="text-muted text-uppercase small border-bottom" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                                                        <th className="py-3 ps-3">PNS Grade</th>
                                                        <th className="py-3 text-center">Available Stock (kg)</th>
                                                        <th className="py-3 text-center">Baseline Rate</th>
                                                        <th className="py-3 text-center">Status</th>
                                                        <th className="py-3 text-end pe-3">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody style={{ fontSize: '0.85rem' }}>
                                                    {isInventoryLoading ? (
                                                        <tr><td colSpan="5" className="text-center py-4">Syncing live inventory database...</td></tr>
                                                    ) : inventoryStock.map((fiber, idx) => (
                                                        <tr key={idx} className="border-bottom" style={{ cursor: 'pointer' }} onClick={() => setSelectedBatch(fiber)}>
                                                            <td className="py-3 ps-3 fw-bold lpmpc-green">{fiber.id}</td>
                                                            <td className="py-3 text-center fw-bold text-dark">{fiber.stockKg.toFixed(1)} kg</td>
                                                            <td className="py-3 text-center fw-bold text-success">{fiber.price}</td>
                                                            <td className="py-3 text-center">
                                                                <span className={`badge rounded-pill px-2 py-1 ${
                                                                    fiber.status === 'Optimal' ? 'bg-success bg-opacity-10 text-success' :
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

                            {/* BATCH DETAIL MODAL */}
                            {selectedBatch && (
                                <div className="modal-backdrop d-flex align-items-center justify-content-center p-2 p-md-3" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(70, 132, 50, 0.4)', zIndex: 2050, backdropFilter: 'blur(4px)' }}>
                                    <div className="card border-0 rounded-4 shadow-lg w-100" style={{ maxWidth: '500px', background: '#ffffff', maxHeight: '90vh', overflowY: 'auto' }}>
                                        <div className="card-header bg-transparent border-0 p-4 d-flex justify-content-between align-items-center sticky-top bg-white">
                                            <div>
                                                <h5 className="fw-bold lpmpc-green m-0 text-uppercase" style={{ fontSize: '1rem' }}>PNS Grade Quality Report</h5>
                                                <small className="text-muted">{selectedBatch.id}</small>
                                            </div>
                                            <button className="btn-close" onClick={() => setSelectedBatch(null)}></button>
                                        </div>

                                        <div className="card-body p-4 pt-0">
                                            <div className="text-center p-4 rounded-4 mb-4" style={{ backgroundColor: '#f8fcf7', border: '1px solid #e1eedd' }}>
                                                <p className="text-muted small text-uppercase fw-bold mb-1">Quality Assessment Score</p>
                                                <h1 className="display-4 fw-bold lpmpc-green m-0">{selectedBatch.score ? selectedBatch.score.split('/')[0] : '92'}<small style={{ fontSize: '1.5rem' }}>%</small></h1>
                                                <span className="badge rounded-pill bg-success bg-opacity-10 text-success px-3 py-2 mt-2">{selectedBatch.grade || selectedBatch.id}</span>
                                            </div>

                                            <h6 className="fw-bold lpmpc-green mb-3 text-uppercase" style={{ fontSize: '0.75rem' }}>PNS/BAFS 318:2021 Metrics</h6>

                                            <div className="vstack gap-3">
                                                {[
                                                    { label: 'Color / Luster', score: 94, desc: 'Light Ivory profile compliant', icon: 'palette' },
                                                    { label: 'Cleanliness (Purity)', score: 88, desc: 'Minimal residual decortication debris', icon: 'cleaning_services' },
                                                    { label: 'Texture / Tensile', score: 91, desc: 'High flexibility and bundle strength', icon: 'texture' }
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
                                    <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">ORDERS MANAGEMENT</h2>
                                    <p className="text-muted m-0 small">Bulk decorticated fiber queue and leaf sourcing allocation</p>
                                </div>
                                <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                            </div>

                            <div className="row g-3 mb-5">
                                {[
                                    { label: 'Pending / Sourcing Orders', count: isLoading ? '...' : String(pendingCount).padStart(2, '0'), color: '#468432' },
                                    { label: 'Orders Processing', count: isLoading ? '...' : String(productionCount).padStart(2, '0'), color: '#b59a00' },
                                    { label: 'Completed Deliveries', count: isLoading ? '...' : String(completedCount).padStart(2, '0'), color: '#6c757d' }
                                ].map((w, i) => (
                                    <div className="col-12 col-md-4" key={i}>
                                        <div className="p-4 bg-white border border-light shadow-sm h-100 rounded-0 border-bottom border-3" style={{ borderBottomColor: w.color }}>
                                            <div className="text-muted fw-bold text-uppercase mb-2" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>{w.label}</div>
                                            <h2 className="fw-bold m-0" style={{ fontSize: '32px', color: w.color }}>{w.count}</h2>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* DYNAMIC PENDING ORDERS QUEUE */}
                            <div className="mb-4 mt-5 border-start border-4 border-warning ps-3">
                                <h2 className="fw-bold m-0 text-uppercase" style={{ fontSize: '24px', letterSpacing: '1px', color: '#b59a00', fontFamily: "'Montserrat', sans-serif" }}>Pending Fiber Requests</h2>
                                <p className="text-muted m-0 small">Incoming decorticated fiber orders requiring stock verification or farm sourcing</p>
                            </div>

                            <div className="row g-4 mb-5">
                                {isLoading ? (
                                    <div className="text-center text-muted small w-100 py-3">Syncing customer orders...</div>
                                ) : cardPendingOrders.length > 0 ? (
                                    cardPendingOrders.map((order) => {
                                        const primaryItem = order.order_items?.[0] || {};
                                        const isSourcing = order.order_status === 'Pending Farmer Sourcing';

                                        return (
                                            <div className="col-12" key={order.id}>
                                                <div className="card border-0 shadow-sm rounded-0 bg-white border-top border-4" style={{ borderColor: isSourcing ? '#b59a00' : '#468432' }}>
                                                    <div className="card-body p-4">
                                                        <div className="row align-items-center g-3">

                                                            {/* CUSTOMER DETAILS */}
                                                            <div className="col-md-5">
                                                                <div className="d-flex justify-content-between mb-1">
                                                                    <span className="text-muted fw-bold small">REF: {order.id.slice(0, 8).toUpperCase()}</span>
                                                                    <span className="badge bg-light text-dark border">{order.order_status}</span>
                                                                </div>
                                                                <h5 className="fw-bold text-uppercase mb-1" style={{ fontSize: '18px', color: '#1e1e24' }}>{order.customer_name}</h5>
                                                                <p className="text-muted small mb-0">Contact: {order.contact_no || 'N/A'}</p>
                                                                <p className="text-muted small mb-0">Address: {order.shipping_address || 'N/A'}</p>
                                                            </div>

                                                            {/* BULK FIBER SPECS */}
                                                            <div className="col-md-4">
                                                                <div className="text-muted fw-bold text-uppercase mb-1" style={{ fontSize: '10px', letterSpacing: '0.5px' }}>Requested Fiber Specs</div>
                                                                <div className="d-flex justify-content-between small mb-1">
                                                                    <span className="text-muted">PNS Grade:</span>
                                                                    <span className="fw-bold text-success">{primaryItem.fiber_type || 'PID-1'}</span>
                                                                </div>
                                                                <div className="d-flex justify-content-between small mb-1">
                                                                    <span className="text-muted">Bulk Weight:</span>
                                                                    <span className="fw-bold">{primaryItem.fiber_weight ? `${primaryItem.fiber_weight} kg` : '1.0 kg'}</span>
                                                                </div>
                                                                <div className="d-flex justify-content-between small">
                                                                    <span className="text-muted">Rate:</span>
                                                                    <span className="fw-bold">₱650.00 / kg</span>
                                                                </div>
                                                            </div>

                                                            {/* PRICING & ACTIONS */}
                                                            <div className="col-md-3 text-md-end border-start ps-md-4">
                                                                <span className="text-muted fw-bold d-block" style={{ fontSize: '10px' }}>TOTAL PRICE</span>
                                                                <h3 className="fw-bold mb-3" style={{ fontSize: '22px', color: '#468432' }}>
                                                                    ₱{Number(order.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                </h3>

                                                                <div className="d-grid gap-2">
                                                                    <button
                                                                        onClick={() => handleApproveOrder(order)}
                                                                        className="btn btn-success btn-sm rounded-0 fw-bold py-2 text-uppercase"
                                                                        style={{ backgroundColor: '#468432', border: 'none', fontSize: '11px' }}
                                                                    >
                                                                        Verify & Approve Order
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRejectOrder(order.id)}
                                                                        className="btn btn-outline-danger btn-sm rounded-0 fw-bold py-2 text-uppercase"
                                                                        style={{ fontSize: '11px' }}
                                                                    >
                                                                        Reject Order
                                                                    </button>
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
                                    <h6 className="m-0 fw-bold lpmpc-green text-uppercase" style={{ letterSpacing: '0.5px' }}>Active Fiber Order Queue</h6>
                                </div>
                                <div className="card-body p-0">
                                    {isLoading ? (
                                        <div className="text-center p-5 text-muted small">Loading order records ledger...</div>
                                    ) : (
                                        <div className="table-responsive">
                                            <table className="table table-hover align-middle mb-0" style={{ fontSize: '14px' }}>
                                                <thead className="bg-light text-uppercase text-muted" style={{ fontSize: '12px', fontWeight: '700' }}>
                                                    <tr>
                                                        <th className="ps-4 py-3">Order ID</th>
                                                        <th className="py-3">Customer Name</th>
                                                        <th className="py-3">PNS Fiber Grade</th>
                                                        <th className="py-3">Weight (kg)</th>
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
                                                                        REF-{order.id.slice(0, 5).toUpperCase()}
                                                                    </td>
                                                                    <td className="py-3">
                                                                        <div className="fw-bold text-uppercase text-dark" style={{ fontSize: '14px' }}>{order.customer_name}</div>
                                                                    </td>
                                                                    <td className="py-3">
                                                                        <span className="badge bg-light text-success border rounded-pill px-3 py-2 fw-bold" style={{ fontSize: '12px' }}>
                                                                            {itemRow.fiber_type || 'PID-1'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-3 fw-bold">
                                                                        {itemRow.fiber_weight || '1.0'} kg
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
                                                                            <option value="Processing">Processing</option>
                                                                            <option value="In Transit">In Transit</option>
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
                                                            <td colSpan="7" className="text-center py-5 text-muted small">
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
                                    <p className="text-muted m-0 small">Bulk fiber transaction history and revenue tracking.</p>
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
                            </div>

                            <div className="bg-white border shadow-sm rounded-0 overflow-hidden">
                                {salesView === 'paid' ? (
                                    <div>
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
                                                                <td className="fw-bold px-4 py-3">REF-{sale.id.slice(0, 5).toUpperCase()}</td>
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
                                    </div>
                                ) : (
                                    <div>
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
                                                                <td className="fw-bold px-4 py-3">REF-{sale.id.slice(0, 5).toUpperCase()}</td>
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

            {/* REAL-TIME DECORTICATED FIBER ORDER DETAILS MODAL */}
            <div className="modal fade" id="orderDetailModal" tabIndex="-1" aria-hidden="true" data-bs-backdrop="static">
                <div className="modal-dialog modal-lg modal-dialog-centered">
                    <div className="modal-content rounded-0 border-0 shadow">
                        <div className="modal-header bg-lpmpc-green text-white rounded-0 py-3 px-4 d-flex justify-content-between align-items-center">
                            <div>
                                <h5 className="modal-title fw-bold text-uppercase m-0" style={{ fontSize: '16px', letterSpacing: '0.5px' }}>
                                    Decorticated Fiber Order Specifications
                                </h5>
                                {selectedOrder && (
                                    <small className="text-white-50 small">
                                        Tracking ID: REF-{selectedOrder.id.slice(0, 5).toUpperCase()}
                                    </small>
                                )}
                            </div>
                            <button type="button" className="btn-close btn-close-white shadow-none" data-bs-dismiss="modal" aria-label="Close" onClick={() => setSelectedOrder(null)}></button>
                        </div>

                        <div className="modal-body p-4 bg-light">
                            {selectedOrder ? (
                                <div className="container-fluid p-0">
                                    <div className="row g-4">
                                        <div className="col-12">
                                            <div className="card border-0 rounded-0 shadow-sm p-3 bg-white mb-3">
                                                <h6 className="fw-bold text-uppercase mb-3 pb-2 border-bottom text-dark" style={{ fontSize: '13px' }}>
                                                    Client & Delivery Profile
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
                                                <h6 className="fw-bold text-uppercase mb-3 pb-2 border-bottom text-dark" style={{ fontSize: '13px' }}>
                                                    Order Items Ledger (Bulk Fiber)
                                                </h6>
                                                <div className="table-responsive">
                                                    <table className="table table-bordered align-middle">
                                                        <thead className="table-light">
                                                            <tr>
                                                                <th>PNS Fiber Grade</th>
                                                                <th className="text-center">Ordered Weight (kg)</th>
                                                                <th className="text-center">Unit Price Rate</th>
                                                                <th className="text-end">Subtotal Price</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {selectedOrder.order_items?.map((item, idx) => (
                                                                <tr key={idx}>
                                                                    <td className="fw-bold text-success">{item.item_name}</td>
                                                                    <td className="text-center">{item.fiber_weight} kg</td>
                                                                    <td className="text-center">₱{item.unit_price} / kg</td>
                                                                    <td className="text-end fw-bold">₱{(item.fiber_weight * item.unit_price).toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
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

            {/* ADD FARMER MODAL */}
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
                                    <input
                                        type="text"
                                        id="farmer-address"
                                        name="address"
                                        className="form-control rounded-0"
                                        onKeyDown={handleAddressKeyDown}
                                        placeholder="Type address & press ENTER..."
                                        required
                                    />

                                    <input type="hidden" id="farmer-lat" name="latitude" />
                                    <input type="hidden" id="farmer-lng" name="longitude" />

                                    <div id="farmer-map" style={{ height: '250px', width: '100%', marginTop: '10px' }}></div>
                                </div>
                                <div className="mb-2">
                                    <label className="small fw-bold text-muted">FARM NAME</label>
                                    <input type="text" name="farmName" className="form-control rounded-0" required />
                                </div>
                                <div className="mb-3">
                                    <label className="small fw-bold text-muted">CONTACT NUMBER</label>
                                    <input
                                        type="text"
                                        name="contactNo"
                                        className="form-control rounded-0"
                                        maxLength={10}
                                        placeholder="9XXXXXXXXX"
                                        required
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="small fw-bold text-muted">PASSWORD</label>
                                    <input type="password" name="password" className="form-control rounded-0" required />
                                </div>
                                <button type="submit" className="btn w-100 rounded-0 text-white fw-bold" style={{ backgroundColor: '#468432' }}>
                                    CREATE FARMER ACCOUNT
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