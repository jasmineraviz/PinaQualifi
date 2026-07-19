import React, { useState, useEffect, useRef } from 'react';
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import { createClient } from '@supabase/supabase-js';
import 'vis-timeline/styles/vis-timeline-graph2d.css';

const supabaseUrl = 'https://bqblzvgwkvdkanobntgn.supabase.co';
const supabaseKey = 'sb_publishable_cKKlFv0eCaArfywT-fqzaQ_QEXrLLbm';
const supabase = createClient(supabaseUrl, supabaseKey);

const PINEAPPLE_BASE_TEMP = 15;

// Historical monthly mean temperatures extracted from WorldClim v2.1
// Climatology baseline (1970–2000) for Camarines Norte geographic grid.
const HISTORICAL_MONTHLY_TEMPS = {
    0: 26.5, 1: 26.8, 2: 27.4, 3: 28.5, 4: 28.9, 5: 28.4,
    6: 28.0, 7: 28.1, 8: 28.0, 9: 27.6, 10: 27.1, 11: 26.7
};

/*
====================================================================
WEATHER ADJUSTMENT DECISION RULES
These thresholds function as decision-support heuristics.
They are intentionally conservative because no locally validated
thermal-time (GDD) equation currently exists for the Queen pineapple
variety under Camarines Norte climatic conditions.
====================================================================
*/
const WEATHER_RULES = {
    EXTREME_COLD_DELAY: 7,
    MODERATE_COLD_DELAY: 4,
    SLIGHT_COLD_DELAY: 2,
    CLIMATE_NORMAL: 0,
    SLIGHT_WARM_ACCELERATION: -2,
    MODERATE_WARM_ACCELERATION: -4,
    EXTREME_WARM_ACCELERATION: -7
};

const formatPHDate = (date) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);

const parseDateOnlyUTC = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
};

const FarmerDashboard = () => {
    const [dateStr, setDateStr] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [userId, setUserId] = useState(null);

    const [farmerProfile, setFarmerProfile] = useState({
        farmerId: '', name: '', fixedLocation: '', contactNumber: '', latitude: null, longitude: null
    });

    const [newPassword, setNewPassword] = useState('');
    const [newContact, setNewContact] = useState('');
    const [plantingDate, setPlantingDate] = useState('');
    const [estimatedHarvest, setEstimatedHarvest] = useState('');
    const [farms, setFarms] = useState([]);

    const timelineRef = useRef(null);
    const timelineContainer = useRef(null);
    const groups = useRef(new DataSet([]));
    const items = useRef(new DataSet([]));
    const [selectedFarm, setSelectedFarm] = useState(null);

    useEffect(() => {
        const now = new Date().toLocaleDateString('en-PH', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
        setDateStr(now);

        const fetchSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUserId(session.user.id);
                fetchFarmerData(session.user.id);
            }
        };
        fetchSession();
    }, []);

    const fetchFarmerData = async (uid) => {
        try {
            const { data: userRow } = await supabase
                .from('users')
                .select('farmer_id, full_name, farm_name, contact_no, latitude, longitude')
                .eq('id', uid)
                .maybeSingle();

            if (userRow) {
                setFarmerProfile({
                    farmerId: userRow.farmer_id || 'N/A',
                    name: userRow.full_name,
                    fixedLocation: userRow.farm_name || 'No Farm Assigned',
                    contactNumber: userRow.contact_no || '',
                    latitude: userRow.latitude,
                    longitude: userRow.longitude
                });
                setNewContact(userRow.contact_no || '');
            }

            const { data: batchData, error: batchError } = await supabase
                .from('farm')
                .select('*')
                .eq('user_id', uid);

            if (batchError) console.error("Batch fetch error:", batchError);

            const hasValidCoordinates =
                Number.isFinite(Number(userRow?.latitude)) &&
                Number.isFinite(Number(userRow?.longitude));

            if (batchData && hasValidCoordinates) {
                const calibratedBatches = await Promise.all(
                    batchData.map(async (farm) => {
                        const todayPHString = formatPHDate(new Date());
                        const daysElapsed = Math.floor(
                            (parseDateOnlyUTC(todayPHString) - parseDateOnlyUTC(farm.start_date)) / 86400000
                        );

                        const pastPhasesSealedDelay = Number(farm.current_delay) || 0;
                        let activePhaseDelay = 0;

                        // FIXED TYPO OVERLAP BUG: Operational ranges are now strictly segregated
                        if (farm.progress >= 0 && farm.progress < 20 && daysElapsed > 30) {
                            activePhaseDelay = daysElapsed - 30;
                        } else if (farm.progress >= 20 && farm.progress < 40 && daysElapsed > 90) {
                            activePhaseDelay = daysElapsed - 90;
                        } else if (farm.progress >= 40 && farm.progress < 60 && daysElapsed > 300) {
                            activePhaseDelay = daysElapsed - 300;
                        } else if (farm.progress >= 60 && farm.progress < 80 && daysElapsed > 360) {
                            activePhaseDelay = daysElapsed - 360;
                        }

                        const totalLiveDelay = pastPhasesSealedDelay + activePhaseDelay;

                        let weatherDecisionDaysShift = 0;
                        if (daysElapsed > 0) {
                            weatherDecisionDaysShift = await calculateHybridClimateShift(farm.start_date, userRow.latitude, userRow.longitude);
                        }

                        const baseEndDate = new Date(farm.start_date);
                        baseEndDate.setMonth(baseEndDate.getMonth() + 14);

                        const totalDaysShift = totalLiveDelay + weatherDecisionDaysShift;
                        const adjustedEndDate = new Date(baseEndDate.getTime() + (totalDaysShift * 24 * 60 * 60 * 1000));

                        return {
                            ...farm,
                            end_date: adjustedEndDate.toISOString().split('T')[0],
                            live_delay: totalLiveDelay,
                            days_elapsed: daysElapsed
                        };
                    })
                );
                setFarms(calibratedBatches);
            } else {
                setFarms(batchData || []);
            }
        } catch (error) {
            console.error('Data calibration pipeline error:', error.message);
        }
    };

    const calculateHybridClimateShift = async (startDate, lat, lng) => {
        try {
            if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return 0;

            const todayObj = new Date();
            const archiveEndObj = new Date(todayObj);
            archiveEndObj.setDate(archiveEndObj.getDate() - 6);
            const archiveEndIso = formatPHDate(archiveEndObj);

            let totalActualGDD = 0;
            let totalExpectedGDD = 0;
            let validWeatherDays = 0;
            let archiveSucceeded = false;
            let forecastSucceeded = false;

            const processDailyData = (daily) => {
                const maxArr = daily?.temperature_2m_max ?? [];
                const minArr = daily?.temperature_2m_min ?? [];
                const timeArr = daily?.time ?? [];
                const length = Math.min(maxArr.length, minArr.length, timeArr.length);

                for (let i = 0; i < length; i++) {
                    const maxTemp = Number(maxArr[i]);
                    const minTemp = Number(minArr[i]);
                    const monthIndex = Number(timeArr[i].slice(5, 7)) - 1;
                    const normalTemp = HISTORICAL_MONTHLY_TEMPS[monthIndex];

                    if (!Number.isFinite(maxTemp) || !Number.isFinite(minTemp) || !Number.isFinite(normalTemp)) {
                        continue;
                    }

                    const dailyAvg = (maxTemp + minTemp) / 2;
                    totalActualGDD += Math.max(0, dailyAvg - PINEAPPLE_BASE_TEMP);
                    totalExpectedGDD += Math.max(0, normalTemp - PINEAPPLE_BASE_TEMP);
                    validWeatherDays++;
                }
            };

            // Request historical data up to 6 days ago (accounting for ERA5 dataset latency)
            if (startDate <= archiveEndIso) {
                try {
                    const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&start_date=${startDate}&end_date=${archiveEndIso}&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FManila`;
                    const archiveRes = await fetch(archiveUrl);
                    if (archiveRes.ok) {
                        const archiveData = await archiveRes.json();
                        processDailyData(archiveData.daily);
                        archiveSucceeded = true;
                    }
                } catch (err) {
                    console.error('Archive weather request failed:', err);
                }
            } else {
                // Archive layer intentionally skipped because planting is within the recent period (< 6 days)
                archiveSucceeded = true;
            }

            // Request short-term weather outlook (includes 5 past days buffer + 7 days forecast)
            try {
                const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&daily=temperature_2m_max,temperature_2m_min&past_days=5&forecast_days=7&timezone=Asia%2FManila`;
                const forecastRes = await fetch(forecastUrl);
                if (forecastRes.ok) {
                    const forecastData = await forecastRes.json();
                    processDailyData(forecastData.daily);
                    forecastSucceeded = true;
                }
            } catch (err) {
                console.error('Forecast weather request failed:', err);
            }

            if (!archiveSucceeded && !forecastSucceeded) return 0;
            if (validWeatherDays === 0 || totalExpectedGDD <= 0) return 0;

            const deviationPercentage = ((totalActualGDD - totalExpectedGDD) / totalExpectedGDD) * 100;

            if (Math.abs(deviationPercentage) <= 3) return WEATHER_RULES.CLIMATE_NORMAL;
            if (deviationPercentage <= -10) return WEATHER_RULES.EXTREME_COLD_DELAY;
            if (deviationPercentage < -6) return WEATHER_RULES.MODERATE_COLD_DELAY;
            if (deviationPercentage < -3) return WEATHER_RULES.SLIGHT_COLD_DELAY;
            if (deviationPercentage <= 6) return WEATHER_RULES.SLIGHT_WARM_ACCELERATION;
            if (deviationPercentage <= 10) return WEATHER_RULES.MODERATE_WARM_ACCELERATION;
            return WEATHER_RULES.EXTREME_WARM_ACCELERATION;

        } catch (error) {
            console.error('Hybrid climate calculation error:', error);
            return 0;
        }
    };

    const handleStatusUpdate = async (id, newStatus) => {
        const { error } = await supabase.from('farm').update({ status_name: newStatus }).eq('id', id);
        if (error) alert("Error updating status: " + error.message);
        else setFarms(farms.map(f => f.id === id ? { ...f, status_name: newStatus } : f));
    };

    const generateBatchId = (pDate) => {
        const d = new Date(pDate);
        const year = d.getFullYear().toString().slice(-2);
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const count = farms.filter(f => f.batch_id?.startsWith(`${year}-${month}`)).length + 1;
        return `${year}-${month}-${count.toString().padStart(4, '0')}`;
    };

    const handleSaveBatch = async (e) => {
        e.preventDefault();
        if (!plantingDate || !userId) return;

        const startDateObj = new Date(plantingDate);
        const endDateObj = new Date(startDateObj);
        endDateObj.setMonth(endDateObj.getMonth() + 14);

        const startIso = startDateObj.toISOString().split('T')[0];
        const endIso = endDateObj.toISOString().split('T')[0];

        const newBatchPayload = {
            user_id: userId, batch_id: generateBatchId(plantingDate), farm_name: farmerProfile.fixedLocation,
            owner_name: farmerProfile.name, contact_number: farmerProfile.contactNumber, start_date: startIso,
            end_date: endIso, status_name: 'Vegetative', progress: 0, current_delay: 0
        };

        const { data, error } = await supabase.from('farm').insert([newBatchPayload]).select();
        if (error) alert("Database Error: " + error.message);
        else if (data) { fetchFarmerData(userId); setPlantingDate(''); setEstimatedHarvest(''); }
    };

    // React single-source filter implementation layer
    const filteredFarms = farms.filter(farm => {
        const batchMatch = (farm.batch_id || '').toLowerCase().includes(searchQuery.toLowerCase());
        const statusMatch = (farm.status_name || '').toLowerCase().includes(searchQuery.toLowerCase());
        return batchMatch || statusMatch;
    });

    useEffect(() => {
        if (timelineContainer.current && !timelineRef.current) {
            timelineRef.current = new Timeline(timelineContainer.current, items.current, groups.current, {
                height: '420px', start: '2024-06-01', end: '2027-04-01', orientation: 'top', stack: false, editable: false
            });
        }
        updateTimelineEngine(filteredFarms);
        return () => { if (timelineRef.current) { timelineRef.current.destroy(); timelineRef.current = null; } };
    }, []);

    // SYNCHRONIZED RE-RENDER TRIGGER: Redraws layout immediately when filters mutate
    useEffect(() => {
        updateTimelineEngine(filteredFarms);
    }, [farms, searchQuery]);

    const updateTimelineEngine = (farmData) => {
        if (!groups.current || !items.current) return;
        groups.current.clear(); items.current.clear();
        const uniqueGroups = []; const dynamicItems = [];

        farmData.forEach((farm, index) => {
            const customGroupId = `group_${farm.id}_${index}`;
            const itemId = `item_${farm.id}_${index}`;
            uniqueGroups.push({ id: customGroupId, content: farm.batch_id });

            const s = (farm.status_name || 'vegetative').toLowerCase();
            let phaseClass = 'bar-veg';
            if (s.includes('harvest')) phaseClass = 'bar-harvest';
            else if (s.includes('matur')) phaseClass = 'bar-maturation';
            else if (s.includes('flow')) phaseClass = 'bar-flow';

            dynamicItems.push({
                id: itemId, group: customGroupId, content: farm.status_name || 'Vegetative',
                start: farm.start_date, end: farm.end_date, className: phaseClass
            });
        });

        groups.current.add(uniqueGroups);
        items.current.add(dynamicItems);
        if (timelineRef.current) {
            timelineRef.current.setGroups(groups.current);
            timelineRef.current.setItems(items.current);
            timelineRef.current.redraw();
        }
    };

    const filterTimeline = (e) => {
        setSearchQuery(e.target.value);
    };

    const handleDateChange = (e) => {
        const pDate = e.target.value;
        setPlantingDate(pDate);
        if (pDate) {
            const dateObj = new Date(pDate);
            dateObj.setMonth(dateObj.getMonth() + 14);
            setEstimatedHarvest(dateObj.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }));
        }
    };

    const handleUpdateSettings = async (e) => {
        e.preventDefault();
        if (!userId) return;
        try {
            const { error: userTableError } = await supabase.from('users').update({ contact_no: newContact }).eq('id', userId);
            if (userTableError) throw userTableError;
            if (newPassword.trim() !== '') {
                const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
                if (authError) throw authError;
            }
            setFarmerProfile(prev => ({ ...prev, contactNumber: newContact }));
            setNewPassword('');
            const modalEl = document.getElementById('settingsModal');
            if (modalEl) {
                const closeBtn = modalEl.querySelector('.btn-close');
                if (closeBtn) closeBtn.click();
            }
        } catch (err) {
            console.error('Security settings update error:', err.message);
        }
    };

    const handleActivityTrigger = async (farm, activity) => {
        const confirmAction = window.confirm(`Are you sure you want to log '${activity}'? This action cannot be undone.`);
        if (!confirmAction) return;

        const activityOrder = ['1st Fertilization', '2nd Fertilization', 'Flower Forcing', 'Fruit Shading', 'Harvest'];
        const currentIndex = activityOrder.indexOf(activity);

        if (currentIndex > 0) {
            const previousActivity = activityOrder[currentIndex - 1];
            if (farm.progress < (currentIndex * 20)) {
                alert(`Please complete '${previousActivity}' first!`);
                return;
            }
        }

        const days = farm.days_elapsed || 0;
        if (activity === '1st Fertilization' && days < 30) return;
        if (activity === '2nd Fertilization' && days < 90) return;
        if (activity === 'Flower Forcing' && days < 300) return;
        if (activity === 'Fruit Shading' && days < 360) return;
        if (activity === 'Harvest' && new Date() < new Date(farm.end_date)) return;

        let newStatus = farm.status_name;
        let newProgress = farm.progress || 0;

        switch (activity) {
            case '1st Fertilization': newStatus = 'Vegetative'; newProgress = 20; break;
            case '2nd Fertilization': newStatus = 'Vegetative'; newProgress = 40; break;
            case 'Flower Forcing': newStatus = 'Flowering'; newProgress = 60; break;
            case 'Fruit Shading': newStatus = 'Maturation'; newProgress = 80; break;
            case 'Harvest': newStatus = 'Harvesting'; newProgress = 100; break;
            default: return;
        }

        const { error } = await supabase.from('farm').update({
            status_name: newStatus, progress: newProgress, end_date: farm.end_date, current_delay: farm.live_delay
        }).eq('id', farm.id);

        if (!error) fetchFarmerData(userId);
    };

    return (
        <div className="farmer-portal bg-light min-vh-100">
            <nav className="navbar navbar-dark p-3 shadow-sm">
                <div className="container-fluid">
                    <h4 className="fw-bold m-0 text-gold">LPMPC</h4>
                    <button type="button" className="settings-icon-btn" data-bs-toggle="modal" data-bs-target="#settingsModal">⚙</button>
                </div>
            </nav>

            <div className="container py-4">
                <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                    <div><h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4">BATCH MANAGEMENT</h2></div>
                    <div className="date-display fw-bold text-uppercase small lpmpc-green">{dateStr}</div>
                </div>

                <div className="card border-0 rounded-0 mb-3 p-3 bg-white">
                    {/* Synchronized query handler injection row */}
                    <input type="text" className="form-control" placeholder="Search batch ID..." value={searchQuery} onChange={filterTimeline} />
                </div>

                <div className="card border-0 rounded-0 shadow-sm bg-white overflow-hidden mb-4">
                    <div className="card-body p-0"><div ref={timelineContainer} style={{ width: '100%', overflowX: 'auto' }}></div></div>
                </div>

                <div className="row g-4">
                    <div className="col-12 col-lg-4">
                        <div className="card border-0 rounded-0 shadow-sm bg-white h-100">
                            <div className="card-header bg-light border-bottom rounded-0 py-3">
                                <h5 className="fw-bold m-0 small text-uppercase lpmpc-green">Log Crop Production Batch</h5>
                            </div>
                            <div className="card-body p-4">
                                <form onSubmit={handleSaveBatch}>
                                    <div className="mb-3">
                                        <label className="form-label small fw-bold text-muted text-uppercase">Farm Identity Node</label>
                                        <input type="text" className="form-control rounded-0 bg-light text-muted fw-bold" value={farmerProfile.fixedLocation || 'Loading...'} readOnly />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label small fw-bold text-muted text-uppercase">Select Planting Date</label>
                                        <input type="date" className="form-control rounded-0" value={plantingDate} onChange={handleDateChange} required />
                                    </div>
                                    <div className="mb-4 p-3 bg-light border border-success border-opacity-25 rounded-0">
                                        <span className="fw-bold small text-uppercase text-success d-block mb-2">Predictive Growth Matrix</span>
                                        <input type="text" className="form-control rounded-0 bg-white fw-bold text-success border-success" value={estimatedHarvest || 'Select Valid Date'} readOnly />
                                    </div>
                                    <button type="submit" className="btn btn-custom-green w-100 rounded-0 text-uppercase fw-bold py-2 shadow-sm">Save Production Batch</button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div className="col-12 col-lg-8">
                        <div className="card border-0 rounded-0 shadow-sm bg-white h-100">
                            <div className="card-header bg-light border-bottom rounded-0 py-3">
                                <h5 className="fw-bold m-0 small text-uppercase">Active Farm Batches</h5>
                            </div>
                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light text-uppercase small fw-bold">
                                        <tr>
                                            <th className="ps-4">Batch ID</th><th>Planting Date</th><th>Status</th><th>Progress</th><th>Predicted Harvest</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredFarms.length > 0 ? (
                                            filteredFarms.map((farm) => {
                                                const s = (farm.status_name || 'vegetative').toLowerCase();
                                                const badgeColors = { vegetative: 'bg-success text-white', flowering: 'bg-pink text-white', maturation: 'bg-warning text-dark', harvesting: 'bg-info text-white' };
                                                const badgeClass = badgeColors[s] || 'bg-success text-white';

                                                return (
                                                    <tr key={farm.id} onClick={() => setSelectedFarm(farm)} style={{ cursor: 'pointer' }}>
                                                        <td className="ps-4 fw-bold">{farm.batch_id}</td>
                                                        <td>{farm.start_date ? new Date(farm.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</td>
                                                        <td><span className={`badge px-2 py-1 ${badgeClass}`}>{farm.status_name || 'Vegetative'}</span></td>
                                                        <td><div className="d-flex align-items-center justify-content-center text-white fw-bold rounded" style={{ backgroundColor: '#468432', width: '80px', height: '30px', fontSize: '0.85rem' }}>{farm.progress || 0}%</div></td>
                                                        <td className="fw-bold text-secondary small">{farm.end_date ? new Date(farm.end_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'}</td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr><td colSpan="5" className="text-center py-4">No records found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="modal fade" id="settingsModal" tabIndex="-1" aria-labelledby="settingsModalLabel" aria-hidden="true">
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content rounded-0 border shadow">
                        <div className="modal-header bg-light rounded-0">
                            <h6 className="modal-title fw-bold text-uppercase lpmpc-green" id="settingsModalLabel">Account Settings</h6>
                            <button type="button" className="btn-close rounded-0 shadow-none" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div className="modal-body p-4">
                            <form onSubmit={handleUpdateSettings}>
                                <div className="row g-3">
                                    <div className="col-6">
                                        <label className="form-label small fw-bold text-muted text-uppercase">Farmer ID</label>
                                        <input type="text" className="form-control rounded-0 bg-light text-muted small" value={farmerProfile.farmerId || ''} readOnly />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label small fw-bold text-muted text-uppercase">Owner Name</label>
                                        <input type="text" className="form-control rounded-0 bg-light text-muted small" value={farmerProfile.name || ''} readOnly />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label small fw-bold text-muted text-uppercase">Update Contact Number</label>
                                        <input type="text" className="form-control rounded-0" value={newContact} onChange={(e) => setNewContact(e.target.value)} />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label small fw-bold text-muted text-uppercase">Change Password</label>
                                        <input type="password" className="form-control rounded-0" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}/>
                                    </div>
                                    <div className="col-12 text-end pt-3">
                                        <button type="button" className="btn btn-sm btn-outline-secondary rounded-0 me-2 text-uppercase fw-bold" data-bs-dismiss="modal">Cancel</button>
                                        <button type="submit" className="btn btn-sm btn-custom-green rounded-0 text-uppercase fw-bold px-3">Update Credentials</button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* Activity Modal with Biological Time-Lock Checks */}
            {selectedFarm && (
                <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-0">
                            <div className="modal-header bg-light rounded-0">
                                <h6 className="modal-title fw-bold text-uppercase lpmpc-green">Activities: {selectedFarm.batch_id}</h6>
                                <button className="btn-close" onClick={() => setSelectedFarm(null)}></button>
                            </div>
                            <div className="modal-body p-4">
                                {['1st Fertilization', '2nd Fertilization', 'Flower Forcing', 'Fruit Shading', 'Harvest'].map((act, index) => {
                                    const threshold = (index + 1) * 20;
                                    const isDone = selectedFarm.progress >= threshold;
                                    let timeConstraintLocked = false;
                                    const days = selectedFarm.days_elapsed || 0;

                                    if (act === '1st Fertilization' && days < 30) timeConstraintLocked = true;
                                    if (act === '2nd Fertilization' && days < 90) timeConstraintLocked = true;
                                    if (act === 'Flower Forcing' && days < 300) timeConstraintLocked = true;
                                    if (act === 'Fruit Shading' && days < 360) timeConstraintLocked = true;
                                    if (act === 'Harvest' && new Date() < new Date(selectedFarm.end_date)) timeConstraintLocked = true;

                                    const isLockedByProgress = selectedFarm.progress < (index * 20);
                                    const finalDisableTrigger = isLockedByProgress || isDone || timeConstraintLocked;

                                    return (
                                        <button
                                            key={act}
                                            className={`btn w-100 mb-2 rounded-0 text-uppercase fw-bold ${
                                                isDone ? 'btn-success' : timeConstraintLocked ? 'btn-outline-danger' : isLockedByProgress ? 'btn-outline-secondary' : 'btn-primary'
                                            }`}
                                            disabled={finalDisableTrigger}
                                            onClick={() => { handleActivityTrigger(selectedFarm, act); setSelectedFarm(null); }}
                                        >
                                            {isDone ? `✔ ${act} (DONE)` : timeConstraintLocked ? `${act} (LOCKED - UNDER DEVELOPMENT)` : act}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FarmerDashboard;