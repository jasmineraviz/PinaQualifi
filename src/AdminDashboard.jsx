import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';

Chart.register(...registerables);

const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('v-dash');
    const [dateStr, setDateStr] = useState('');
    const [salesView, setSalesView] = useState('paid');

    // Refs for libraries
    const timelineRef = useRef(null);
    const chartRef = useRef(null);
    const timelineContainer = useRef(null);
    const chartCanvas = useRef(null);
    const salesChartCanvas = useRef(null);
    const salesChartRef = useRef(null);

    // Data Sets
    const groups = useRef(new DataSet([
        {id: 1, content: 'Lallo QP Farm'},
        {id: 2, content: 'Gadin QP Farm'},
        {id: 3, content: 'Vasquez QP'},
        {id: 4, content: 'Abuyo QP Farm'}
    ]));

    const items = useRef(new DataSet([
        {id: 1, group: 1, content: 'Vegetative', start: '2026-01-01', end: '2026-06-01', className: 'bar-veg'},
        {id: 2, group: 1, content: 'Flowering', start: '2026-06-02', end: '2026-08-01', className: 'bar-flow'},
        {id: 3, group: 3, content: 'Vegetative', start: '2026-02-15', end: '2026-07-15', className: 'bar-veg'},
        {id: 4, group: 3, content: 'Flowering', start: '2026-07-16', end: '2026-09-15', className: 'bar-flow'}
    ]));

    const [selectedBatch, setSelectedBatch] = useState(null);
    const handleViewDetails = (batch) => {
        setSelectedBatch(batch);
    };

    useEffect(() => {
        // 1. Set Date display
        const now = new Date().toLocaleDateString('en-PH', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
        setDateStr(now);

        // ADDED: Window Resize Listener for Charts Responsiveness
        const handleResize = () => {
            if (chartRef.current) chartRef.current.resize();
            if (salesChartRef.current) salesChartRef.current.resize();
            if (timelineRef.current) timelineRef.current.checkResize();
        };
        window.addEventListener('resize', handleResize);

        if (timelineContainer.current && !timelineRef.current) {
            timelineRef.current = new Timeline(timelineContainer.current, items.current, groups.current, {
                height: '450px',
                start: '2026-01-01',
                end: '2026-12-31',
                orientation: 'top'
            });
        }

        // 3. Initialize Doughnut Chart (Yield Distribution)
        if (chartCanvas.current && !chartRef.current) {
                   chartRef.current = new Chart(chartCanvas.current, {
                       type: 'doughnut',
                       data: {
                           labels: ['PID-1', 'PID-2', 'PID-3', 'PID-4', 'PID-R'],
                           datasets: [{
                               data: [120, 190, 80, 50, 30],
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
                                       font: {
                                           family: "'Montserrat', sans-serif",
                                           size: 12,
                                           weight: '600'
                                       },
                                       color: '#1e1e24'
                                   }
                               },
                               tooltip: {
                                   backgroundColor: '#468432',
                                   titleFont: { family: "'Montserrat', sans-serif" },
                                   bodyFont: { family: "'Montserrat', sans-serif" },
                                   padding: 10,
                                   cornerRadius: 8,
                                   displayColors: true
                               }
                           },
                           cutout: '55%'
                       }
                   });
               }

        // 4. Initialize Sales Income Chart
        if (salesChartCanvas.current && !salesChartRef.current) {
            const ctx = salesChartCanvas.current.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(70, 132, 50, 0.2)');
            gradient.addColorStop(1, 'rgba(70, 132, 50, 0)');

            salesChartRef.current = new Chart(salesChartCanvas.current, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Income (₱)',
                        data: [12000, 19000, 15000, 25000, 22000, 30000],
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
            window.removeEventListener('resize', handleResize); // Cleanup listener
            if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
            if (salesChartRef.current) { salesChartRef.current.destroy(); salesChartRef.current = null; }
        };
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'v-farm' && timelineRef.current) {
            setTimeout(() => {
                timelineRef.current.checkResize();
                timelineRef.current.redraw();
            }, 50);
        }
    }, [activeTab]);


    const filterTimeline = (e) => {
        const val = e.target.value.toLowerCase();
        groups.current.forEach((group) => {
            const isVisible = group.content.toLowerCase().indexOf(val) !== -1;
            groups.current.update({id: group.id, visible: isVisible});
        });
    };

    return (
        <div className="admin-layout">
            <link href="https://unpkg.com/vis-timeline@latest/styles/vis-timeline-graph2d.min.css" rel="stylesheet" />
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />

            <style dangerouslySetInnerHTML={{ __html: `
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&family=Playfair+Display:wght@700&display=swap');

                :root {
                    --lpmpc-green: #468432;
                    --lpmpc-gold: #ffd700;
                    --lpmpc-light-yellow: #FFEF91;
                    --text-dark: #1e1e24;
                }

                html, body { margin: 0; padding: 0; width: 100%; overflow-x: hidden; }
                body { font-family: 'Montserrat', sans-serif; color: var(--text-dark); background-color: #ffffff; }

                /* DYNAMIC MAIN LAYOUT FIX */
                main { transition: all 0.3s ease; }

                @media (min-width: 992px) {
                    main.offset-lg-2 {
                        margin-left: 16.666667% !important;
                        width: 83.333333% !important;
                    }
                }

                @media (max-width: 991px) and (min-width: 769px) {
                    nav.position-fixed { width: 80px !important; }
                    main {
                        margin-left: 80px !important;
                        width: calc(100% - 80px) !important;
                    }
                    .admin-tab-btn { font-size: 0; justify-content: center; padding: 15px 0; }
                    .admin-tab-btn span { margin: 0 !important; }
                }

                @media (max-width: 768px) {
                    nav.bg-lpmpc-green {
                        width: 100% !important; height: 60px !important;
                        position: fixed !important; top: 0; left: 0;
                        flex-direction: row !important; justify-content: space-between;
                        padding: 0 15px !important; z-index: 2000;
                    }
                    nav .p-4.border-bottom { display: none; }
                    nav .nav { flex-direction: row !important; height: 100%; align-items: center; }
                    .admin-tab-btn {
                        width: auto !important; height: 100% !important; font-size: 0 !important;
                        padding: 0 10px !important; border-left: none !important; position: relative;
                    }
                    .admin-tab-btn.active::after {
                        content: ""; position: absolute; bottom: 0; left: 0; right: 0;
                        height: 4px; background-color: var(--lpmpc-gold);
                    }
                    main { margin-left: 0 !important; margin-top: 60px !important; width: 100% !important; }
                }

                .admin-layout .card {
                    transition: none !important;
                    transform: none !important;
                    border-radius: 0 !important;
                    border: 1px solid rgba(0,0,0,0.125) !important;
                }

                .admin-layout .card.border-start {
                    border-top: none !important; border-right: none !important;
                    border-bottom: none !important; border-left-width: 4px !important;
                }

                .bg-lpmpc-green { background-color: var(--lpmpc-green) !important; }
                .text-gold { color: var(--lpmpc-gold) !important; }

                .admin-tab-btn {
                    background: none; border: none; color: white; padding: 15px 25px;
                    text-align: left; width: 100%; display: flex; align-items: center; gap: 10px;
                    transition: 0.3s; opacity: 0.7; font-weight: bold;
                }
                .admin-tab-btn:hover, .admin-tab-btn.active { opacity: 1; background: rgba(255,255,255,0.1); }
                .admin-tab-btn.active { color: var(--lpmpc-gold); }

                .lpmpc-green { color: var(--lpmpc-green) !important; }
                .bar-veg { background-color: #a3c19a !important; color: #1e3d14 !important; }
                .bar-flow { background-color: var(--lpmpc-gold) !important; color: #000 !important; }
            `}} />

            <div className="container-fluid p-0">
                <div className="row g-0">
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
                                <span className="material-symbols-outlined">orders</span> ORDER
                            </button>
                            <button className={`admin-tab-btn ${activeTab === 'v-sales' ? 'active' : ''}`} onClick={() => setActiveTab('v-sales')}>
                                <span className="material-symbols-outlined">payments</span> SALES
                            </button>
                        </div>
                    </nav>

                    <main className="col-md-9 col-lg-10 offset-md-3 offset-lg-2 p-3 p-md-4">
                        {/* DASHBOARD TAB */}
                        <div className={`admin-tab-content ${activeTab !== 'v-dash' ? 'd-none' : ''}`}>

                               {/* Header Section */}
                               <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                                   <div>
                                       <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">DASHBOARD</h2>
                                       <p className="text-muted m-0 small">Summary Overview</p>
                                   </div>
                                   <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                               </div>

                               <div className="row g-3 mb-5">
                                   {[
                                       { label: 'Total Sales', count: '₱1,800', color: '#468432' },
                                       { label: 'Active Farms', count: '15', color: '#b59a00' },
                                       { label: 'Current Orders', count: '124', color: '#6c757d' }
                                   ].map((w, i) => (
                                       <div className="col-12 col-sm-4" key={i}>
                                           <div className="p-4 bg-white border border-light shadow-sm h-100 rounded-0 border-bottom border-3"
                                                style={{ borderBottom: `3px solid ${w.color}` }}>
                                               <div className="text-muted fw-bold text-uppercase mb-2"
                                                    style={{ fontSize: '11px', letterSpacing: '0.5px' }}>
                                                   {w.label}
                                               </div>
                                               <h2 className="fw-bold m-0"
                                                   style={{ fontSize: '32px', color: w.color, fontFamily: "'Montserrat', sans-serif" }}>
                                                   {w.count}
                                               </h2>
                                           </div>
                                       </div>
                                   ))}
                               </div>


                            {/* Charts Row: Stack on Tablet/Mobile */}
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

                       {/* FARM TAB */}
                       <div className={`admin-tab-content ${activeTab !== 'v-farm' ? 'd-none' : ''}`}>
                           {/* Header: Stack sa mobile, Side-by-side sa small screens up */}
                           <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                               <div>
                                   <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">FARM MANAGEMENT</h2>
                                   <p className="text-muted m-0 small">Dynamic tracking of growth and harvest cycles</p>
                               </div>
                               <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                           </div>

                           {/* Search & Instructions Area */}
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

                           {/* Timeline Container */}
                           <div className="card border rounded-0 shadow-sm bg-white no-hover overflow-hidden">
                               <div ref={timelineContainer} style={{ width: '100%', overflowX: 'auto' }}></div>
                           </div>

                           {/* TABLE SECTION */}
                           <div className="card border rounded-0 shadow-sm bg-white no-hover mt-4">
                               <div className="card-header bg-light border-bottom rounded-0 py-3">
                                   <h5 className="fw-bold m-0 small text-uppercase">Active Farm Batches</h5>
                               </div>
                               <div className="table-responsive">
                                   <table className="table table-hover align-middle mb-0" style={{ minWidth: '600px' }}>
                                       <thead className="table-light text-uppercase small fw-bold">
                                           <tr>
                                               <th className="ps-4">Farm Name</th>
                                               <th>Owner / Contact</th>
                                               <th className="d-none d-md-table-cell">Contact Number</th>
                                               <th>Status</th>
                                               <th style={{width: '150px'}}>Progress</th>
                                           </tr>
                                       </thead>
                                       <tbody>
                                           <tr>
                                               <td className="ps-4 fw-bold">Lallo QP Farm</td>
                                               <td>Juan Dela Cruz</td>
                                               <td className="d-none d-md-table-cell">+63 912 345 6789</td>
                                               <td><span className="badge bg-warning text-dark">Flowering</span></td>
                                               <td>
                                                   <div className="progress" style={{height: '8px'}}>
                                                       <div className="progress-bar bg-success" style={{width: '65%'}}></div>
                                                   </div>
                                               </td>
                                           </tr>
                                       </tbody>
                                   </table>
                               </div>
                           </div>
                       </div>

                       {/* INVENTORY TAB */}
                       <div className={`admin-tab-content ${activeTab !== 'v-inv' ? 'd-none' : ''}`}>
                           <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                               <div>
                                   <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">Fiber Inventory</h2>
                                   <p className="text-muted m-0 small">Quality Grading System • Grading & Texture</p>
                               </div>
                               <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                           </div>

                           <div className="row g-4 mb-4">
                               {/* ROBOTICS LIVE VIEW */}
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
                                               {/* Progressive Metrics */}
                                               {[{l: 'Color', v: '94%'}, {l: 'Purity', v: '88%'}, {l: 'Texture', v: '91%'}].map((m, i) => (
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

                               {/* BATCH HISTORY */}
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
                                                               <button className="btn btn-sm text-success fw-bold p-0" style={{fontSize: '0.75rem'}}> View Details</button>
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

                               {/* COMPREHENSIVE FIBER STOCK LEDGER */}
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
                                                               <span className={`badge rounded-pill px-2 py-1 ${
                                                                   fiber.status === 'Optimal' ? 'bg-success bg-opacity-10 text-success' :
                                                                   fiber.status === 'Low Stock' ? 'bg-warning bg-opacity-10 text-warning' :
                                                                   'bg-danger bg-opacity-10 text-danger'
                                                               }`} style={{ fontSize: '0.65rem' }}>
                                                                   {fiber.status}
                                                               </span>
                                                           </td>
                                                           <td className="py-3 text-end pe-3">
                                                               <button className="btn btn-sm text-success fw-bold p-0" style={{fontSize: '0.75rem'}}>
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

                           {/* MODAL RESPONSIVE FIX */}
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

                            {/* ORDER TAB */}
                           <div className={`admin-tab-content ${activeTab !== 'v-order' ? 'd-none' : ''}`}>
                               {/* --- SECTION 1: NORMAL ORDERS (ORIGINAL CODE) --- */}
                               <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                                   <div>
                                       <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">ORDER</h2>
                                       <p className="text-muted m-0 small">Production queue and fiber resource allocation</p>
                                   </div>
                                   <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                               </div>

                               {/* INDIVIDUAL SUMMARY BOXES */}
                               <div className="row g-3 mb-5">
                                   {[
                                       { label: 'Pending Requests', count: '08', color: '#468432' },
                                       { label: 'In Production', count: '15', color: '#b59a00' },
                                       { label: 'Orders Completed', count: '124', color: '#6c757d' }
                                   ].map((w, i) => (
                                       <div className="col-12 col-md-4" key={i}>
                                           <div className="p-4 bg-white border border-light shadow-sm h-100 rounded-0 border-bottom border-3" style={{ borderBottomColor: w.color }}>
                                               <div className="text-muted fw-bold text-uppercase mb-2" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>{w.label}</div>
                                               <h2 className="fw-bold m-0" style={{ fontSize: '32px', color: w.color, fontFamily: "'Montserrat', sans-serif" }}>{w.count}</h2>
                                           </div>
                                       </div>
                                   ))}
                               </div>

                               {/* SHARP ORDER CARDS (NORMAL) */}
                               <div className="row g-4 mb-5">
                                   {[
                                       { id: '101', time: '10:30 AM', name: 'JUAN DELA CRUZ', item: 'Barong Tagalog', qty: '2 units', price: '8,500', fiber: 'PID-1', req: '1.5 kg', stock: 'Sufficient' },
                                       { id: '102', time: '11:15 AM', name: 'MARIA SANTOS', item: 'Piña Cloth', qty: '5 meters', price: '12,000', fiber: 'PID-2', req: '3.0 kg', stock: 'Low Stock' },
                                       { id: '103', time: '01:45 PM', name: 'LOCAL COOPERATIVE', item: 'Alampay', qty: '10 units', price: '5,000', fiber: 'PID-3', req: '0.8 kg', stock: 'Sufficient' }
                                   ].map((order, i) => (
                                       <div className="col-12 col-lg-4 col-md-6" key={i}>
                                           <div className="card border-0 shadow-sm rounded-0 h-100 bg-white border-top border-4" style={{ borderColor: order.stock === 'Sufficient' ? '#468432' : '#dc3545' }}>
                                               <div className="card-body p-4">
                                                   <div className="d-flex justify-content-between mb-2">
                                                       <span className="text-muted fw-bold" style={{ fontSize: '11px' }}>REF: {order.id}</span>
                                                       <span className="fw-bold text-uppercase" style={{ fontSize: '11px', color: order.stock === 'Sufficient' ? '#468432' : '#dc3545' }}>
                                                           {order.stock}
                                                       </span>
                                                   </div>
                                                   <div className="mb-4 text-muted border-bottom pb-2" style={{ fontSize: '12px' }}>
                                                       <span className="material-symbols-outlined align-middle me-1" style={{ fontSize: '14px' }}>schedule</span>
                                                       Ordered at: <span className="fw-bold text-dark">{order.time}</span>
                                                   </div>

                                                   <div className="mb-4">
                                                       <h5 className="fw-bold m-0 text-uppercase" style={{ fontSize: '18px', fontFamily: "'Montserrat', sans-serif" }}>{order.name}</h5>
                                                       <div className="text-muted mt-1" style={{ fontSize: '14px' }}>{order.item} / {order.qty}</div>
                                                   </div>

                                                   <div className="border border-light mb-4">
                                                       <div className="d-flex justify-content-between p-2 border-bottom border-light bg-light">
                                                           <span className="text-muted fw-bold" style={{ fontSize: '10px' }}>FIBER SPEC</span>
                                                           <span className="text-muted fw-bold" style={{ fontSize: '10px' }}>VALUE</span>
                                                       </div>
                                                       <div className="d-flex justify-content-between p-2 border-bottom border-light">
                                                           <span style={{ fontSize: '13px' }}>Type</span>
                                                           <span className="fw-bold" style={{ fontSize: '13px' }}>{order.fiber}</span>
                                                       </div>
                                                       <div className="d-flex justify-content-between p-2">
                                                           <span style={{ fontSize: '13px' }}>Required Weight</span>
                                                           <span className="fw-bold" style={{ fontSize: '13px' }}>{order.req}</span>
                                                       </div>
                                                   </div>

                                                   <div className="mb-4 d-flex justify-content-between align-items-end">
                                                       <span className="text-muted fw-bold" style={{ fontSize: '11px' }}>TOTAL PRICE</span>
                                                       <span className="fw-bold lpmpc-green" style={{ fontSize: '20px', fontFamily: "'Montserrat', sans-serif" }}>₱{order.price}</span>
                                                   </div>

                                                   <div className="d-flex gap-2">
                                                       <button className="btn btn-outline-secondary btn-sm flex-grow-1 rounded-0 fw-bold border-1 py-2" style={{ fontSize: '12px' }}>REJECT</button>
                                                       <button className="btn btn-success btn-sm flex-grow-1 rounded-0 fw-bold border-0 py-2" style={{ fontSize: '12px', backgroundColor: '#468432' }} disabled={order.stock !== 'Sufficient'}>APPROVE</button>
                                                   </div>
                                               </div>
                                           </div>
                                       </div>
                                   ))}
                               </div>

                               {/* --- SECTION 2: CUSTOMIZED ORDERS (WITH MULTIPLE SIZES) --- */}
                               <div className="mb-4 mt-5 border-start border-4 border-warning ps-3">
                                   <h2 className="fw-bold m-0 text-uppercase" style={{ fontSize: '24px', letterSpacing: '1px', color: '#b59a00', fontFamily: "'Montserrat', sans-serif" }}>Customized Orders</h2>
                                   <p className="text-muted m-0 small">Bespoke designs with multiple unit measurements</p>
                               </div>

                               <div className="row g-4 mb-5">
                                   {[
                                       {
                                           id: 'C-505',
                                           time: '11:45 AM',
                                           name: 'RENE NAVARRO',
                                           baseItem: 'Custom Barong Tagalog (Set)',
                                           designRef: 'https://via.placeholder.com/150',
                                           fiber: 'PID-Prime',
                                           req: '7.5 kg',
                                           stock: 'Sufficient',
                                           totalQty: '5 Units',
                                           // Array of different sizes for the same customer
                                           items: [
                                               { label: 'Unit 1', bust: '38"', waist: '32"', length: '29"' },
                                               { label: 'Unit 2', bust: '40"', waist: '34"', length: '30"' },
                                               { label: 'Unit 3', bust: '42"', waist: '36"', length: '31"' },
                                               { label: 'Unit 4', bust: '36"', waist: '30"', length: '28"' },
                                               { label: 'Unit 5', bust: '44"', waist: '38"', length: '32"' }
                                           ]
                                       }
                                   ].map((custom, i) => (
                                       <div className="col-12" key={i}>
                                           <div className="card border-0 shadow-sm rounded-0 bg-white border-top border-4" style={{ borderColor: '#b59a00' }}>
                                               <div className="card-body p-0">
                                                   <div className="row g-0">
                                                       {/* Design Preview Column */}
                                                       <div className="col-md-2 bg-light d-flex align-items-center justify-content-center border-end border-light p-3 text-center">
                                                           <div>
                                                               <div className="text-muted fw-bold mb-2" style={{ fontSize: '9px' }}>DESIGN REF</div>
                                                               <img src={custom.designRef} alt="Ref" className="img-fluid border border-white shadow-sm mb-2" style={{ maxHeight: '120px' }} />
                                                               <button className="btn btn-dark btn-sm rounded-0 w-100 fw-bold" style={{ fontSize: '9px' }}>VIEW FULL</button>
                                                           </div>
                                                       </div>

                                                       {/* Measurement Table Column */}
                                                       <div className="col-md-7 p-4 border-end border-light">
                                                           <div className="d-flex justify-content-between mb-2">
                                                               <span className="text-muted fw-bold small">REF: {custom.id}</span>
                                                               <span className="text-muted small">Qty: <b>{custom.totalQty}</b></span>
                                                           </div>
                                                           <h5 className="fw-bold text-uppercase mb-1" style={{ fontSize: '18px', fontFamily: "'Montserrat', sans-serif" }}>{custom.name}</h5>
                                                           <div className="lpmpc-green fw-bold mb-3 small">{custom.baseItem}</div>

                                                           {/* TABLE FOR MULTIPLE SIZES */}
                                                           <div className="table-responsive">
                                                               <table className="table table-sm table-bordered mb-0" style={{ fontSize: '12px' }}>
                                                                   <thead className="bg-light text-center">
                                                                       <tr style={{ fontSize: '10px' }} className="text-muted">
                                                                           <th>UNIT</th>
                                                                           <th>BUST</th>
                                                                           <th>WAIST</th>
                                                                           <th>LENGTH</th>
                                                                       </tr>
                                                                   </thead>
                                                                   <tbody className="text-center">
                                                                       {custom.items.map((item, idx) => (
                                                                           <tr key={idx}>
                                                                               <td className="fw-bold bg-light">{item.label}</td>
                                                                               <td>{item.bust}</td>
                                                                               <td>{item.waist}</td>
                                                                               <td>{item.length}</td>
                                                                           </tr>
                                                                       ))}
                                                                   </tbody>
                                                               </table>
                                                           </div>
                                                       </div>

                                                       {/* Fiber & Actions Column */}
                                                       <div className="col-md-3 p-4 bg-white d-flex flex-column justify-content-between">
                                                           <div>
                                                               <div className="text-muted fw-bold text-uppercase mb-2" style={{ fontSize: '10px' }}>Production Specs</div>
                                                               <div className="d-flex justify-content-between small"><span>Fiber:</span> <b>{custom.fiber}</b></div>
                                                               <div className="d-flex justify-content-between small"><span>Total Req:</span> <b>{custom.req}</b></div>
                                                               <div className="text-success fw-bold text-end mt-2 small">● {custom.stock.toUpperCase()}</div>
                                                           </div>
                                                           <div className="d-grid gap-2 mt-3">
                                                               <button className="btn btn-success btn-sm rounded-0 fw-bold py-2" style={{ backgroundColor: '#468432', border: 'none' }}>APPROVE SET</button>
                                                               <button className="btn btn-outline-secondary btn-sm rounded-0 fw-bold py-2">REJECT</button>
                                                           </div>
                                                       </div>
                                                   </div>
                                               </div>
                                           </div>
                                       </div>
                                   ))}
                               </div>

                               <style dangerouslySetInnerHTML={{ __html: `
                                    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap');
                                    .lpmpc-green { color: #468432 !important; }
                                    .card { transition: transform 0.2s ease; }
                                    .card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important; }
                                    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
                                    .text-lpmpc { color: #468432; }
                                    .table-sm td, .table-sm th { padding: 0.5rem; }
                               `}} />
                           </div>

                        {/* SALES TAB */}
                        <div className={`admin-tab-content ${activeTab !== 'v-sales' ? 'd-none' : ''}`}>
                            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                                <div>
                                    <h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4 fs-md-2">SALES RECORD</h2>
                                    <p className="text-muted m-0 small">Transaction history and revenue tracking.</p>
                                </div>
                                <div className="date-display fw-bold text-uppercase small text-lpmpc">{dateStr}</div>
                            </div>

                            {/* SUMMARY SECTION */}
                            <div className="row g-3 mb-4">
                                {[
                                    { label: 'Total Revenue (Paid)', count: '₱37,500', color: '#468432' },
                                    { label: 'Pending Receivables', count: '₱8,200', color: '#b59a00' },
                                    { label: 'Total Orders', count: '03', color: '#6c757d' }
                                ].map((w, i) => (
                                     <div className="col-12 col-sm-4" key={i}>
                                         <div className="p-4 bg-white border border-light shadow-sm h-100 rounded-0 border-bottom border-3"
                                              style={{ borderBottom: `3px solid ${w.color}` }}>
                                             <div className="text-muted fw-bold text-uppercase mb-2" style={{ fontSize: '11px', letterSpacing: '0.5px' }}>{w.label}</div>
                                             <h2 className="fw-bold m-0" style={{ fontSize: '32px', color: w.color, fontFamily: "'Montserrat', sans-serif" }}>{w.count}</h2>
                                         </div>
                                     </div>
                                 ))}
                            </div>

                            {/* CUSTOM TABS & FILTERS (NO BLUE) */}
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
                                        <i className="bi bi-file-earmark-excel me-1"></i> Export
                                    </button>
                                </div>
                            </div>

                            {/* TABLE CONTAINER */}
                            <div className="bg-white border shadow-sm rounded-0 overflow-hidden">
                                {salesView === 'paid' ? (
                                    /* PAID TABLE CONTENT */
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
                                                    {[
                                                        { id: 'ORD-001', date: 'May 08, 2026', client: 'Juan Dela Cruz', amount: '₱12,500.00' },
                                                        { id: 'ORD-003', date: 'May 09, 2026', client: 'Bagasbas Cooperative', amount: '₱25,000.00' },
                                                    ].map((sale, i) => (
                                                        <tr key={i} className="border-bottom">
                                                            <td className="fw-bold px-4 py-3">{sale.id}</td>
                                                            <td className="text-muted">{sale.date}</td>
                                                            <td>{sale.client}</td>
                                                            <td className="text-end fw-bold px-4 py-3 text-success" style={{ color: '#468432' }}>{sale.amount}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="p-3 text-end bg-light border-top">
                                            <small className="text-muted text-uppercase fw-bold me-2" style={{ fontSize: '10px' }}>Subtotal (Paid):</small>
                                            <span className="fw-bold fs-5" style={{ color: '#468432' }}>₱37,500.00</span>
                                        </div>
                                    </div>
                                ) : (
                                    /* UNPAID TABLE CONTENT */
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
                                                    {[
                                                        { id: 'ORD-002', date: 'May 09, 2026', client: 'Maria Santos', status: 'Accepted', amount: '₱8,200.00' },
                                                    ].map((sale, i) => (
                                                        <tr key={i} className="border-bottom">
                                                            <td className="fw-bold px-4 py-3">{sale.id}</td>
                                                            <td className="text-muted">{sale.date}</td>
                                                            <td>{sale.client}</td>
                                                            <td>
                                                                <span className="badge rounded-pill fw-normal border px-3"
                                                                      style={{ backgroundColor: '#fff9e6', color: '#b59a00', borderColor: '#ffeeba' }}>
                                                                    {sale.status}
                                                                </span>
                                                            </td>
                                                            <td className="text-end fw-bold px-4 py-3 text-danger">{sale.amount}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="p-3 text-end bg-light border-top">
                                            <small className="text-muted text-uppercase fw-bold me-2" style={{ fontSize: '10px' }}>Total Unpaid:</small>
                                            <span className="fw-bold text-danger fs-5">₱8,200.00</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </main>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;