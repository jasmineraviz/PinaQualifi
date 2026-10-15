import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Timeline } from 'vis-timeline/standalone';
import { DataSet } from 'vis-data';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import 'vis-timeline/styles/vis-timeline-graph2d.css';

const supabaseUrl = 'https://bqblzvgwkvdkanobntgn.supabase.co';
const supabaseKey = 'sb_publishable_cKKlFv0eCaArfywT-fqzaQ_QEXrLLbm';
const supabase = createClient(supabaseUrl, supabaseKey);

const PINEAPPLE_BASE_TEMP = 15;

const HISTORICAL_MONTHLY_TEMPS = {
    0: 26.5, 1: 26.8, 2: 27.4, 3: 28.5, 4: 28.9, 5: 28.4,
    6: 28.0, 7: 28.1, 8: 28.0, 9: 27.6, 10: 27.1, 11: 26.7
};

const WEATHER_RULES = {
    EXTREME_COLD_DELAY: 7,
    MODERATE_COLD_DELAY: 4,
    SLIGHT_COLD_DELAY: 2,
    CLIMATE_NORMAL: 0,
    SLIGHT_WARM_ACCELERATION: -2,
    MODERATE_WARM_ACCELERATION: -4,
    EXTREME_WARM_ACCELERATION: -7
};

const CROP_STAGES = [
    {
        name: '1st Fertilization (Month 1 - Saha Rooting)',
        key: 'fert_1',
        minDays: 30,
        progress: 15,
        status: 'Vegetative',
        details: 'Ammophos 16-20-0 (0.5 bag), Urea 46-0-0 (1 bag), Complete 14-14-14 (1.5 bags)'
    },
    {
        name: '2nd Fertilization (Month 4 - Early Vegetative Flush)',
        key: 'fert_2',
        minDays: 120,
        progress: 30,
        status: 'Vegetative',
        details: 'Urea 46-0-0 (1.5 bags), Calcium Nitrate 17-0-17 (0.5 bag)'
    },
    {
        name: '3rd Fertilization (Month 7 - Canopy/Leaf Mass Building)',
        key: 'fert_3',
        minDays: 210,
        progress: 45,
        status: 'Vegetative',
        details: 'Ammophos 16-20-0 (0.5 bag), Urea 46-0-0 (1 bag), Complete 14-14-14 (1.5 bags)'
    },
    {
        name: '4th Fertilization (Month 10 - Pre-Induction Peak)',
        key: 'fert_4',
        minDays: 300,
        progress: 60,
        status: 'Vegetative',
        details: 'Urea 46-0-0 (1.5 bags), Calcium Nitrate 17-0-17 (0.5 bag)'
    },
    {
        name: 'Flower Forcing / Pagpapabulaklak (Month 11-12)',
        key: 'forcing',
        minDays: 340,
        progress: 75,
        status: 'Flowering',
        details: 'Ethrel (0.5L) + Urea (21kg) + Sticker (1L) on mature saha'
    },
    {
        name: 'Fruit Shading / Pagpapalukob (Month 14)',
        key: 'shading',
        minDays: 420,
        progress: 85,
        status: 'Maturation',
        details: 'Covering fruit with dried pineapple leaves/grass to prevent sunburn'
    },
    {
        name: 'Harvest Stage / Pag-aani (Month 16-18)',
        key: 'harvest',
        minDays: 480,
        progress: 100,
        status: 'Harvesting',
        details: '20-30% shell yellowing (Queen/Formosa standard)'
    },
    {
        name: 'Harvested / Naani na',
        key: 'harvested',
        minDays: 480,
        progress: 100,
        status: 'Harvested',
        details: 'Batch completed'
    }
];

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
    const navigate = useNavigate();
    const [dateStr, setDateStr] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [userId, setUserId] = useState(null);

    const [farmerProfile, setFarmerProfile] = useState({
        farmerId: '', name: '', fixedLocation: '', contactNumber: '', latitude: null, longitude: null
    });

    const [newPassword, setNewPassword] = useState('');
    const [newContact, setNewContact] = useState('');
    const [plantingDate, setPlantingDate] = useState('');
    const [estimatedHarvest, setEstimatedHarvest] = useState('');
    const [farms, setFarms] = useState([]);

   const [plantingAudit, setPlantingAudit] = useState({
       isOpen: false,
       isBackdated: false,
       daysElapsed: 0,
       elapsedStages: [],
       checkedStages: {},
       basalWeedControl: false,
       sahaGraded: true,
       pendingBatchPayload: null
   });

    // Auto-opened prompt for pending crop activities
    const [fertilizerPrompt, setFertilizerPrompt] = useState({
        isOpen: false,
        farm: null,
        stage: null,
        applied: 'yes',
        appliedDate: formatPHDate(new Date()),
        fertilizersUsed: ''
    });

    const timelineRef = useRef(null);
    const timelineContainer = useRef(null);
    const groups = useRef(new DataSet([]));
    const items = useRef(new DataSet([]));

    // Scans batches for activities due for input
    const checkAndTriggerPendingActivity = useCallback((calibratedBatches) => {
        for (const farm of calibratedBatches) {
            if (farm.status_name === 'Harvested') continue;

            for (let i = 0; i < CROP_STAGES.length; i++) {
                const stage = CROP_STAGES[i];
                const isCompleted = farm.progress >= stage.progress;
                if (isCompleted) continue;

                const days = farm.days_elapsed || 0;
                let isDue = days >= stage.minDays;

                if (stage.key === 'harvest') {
                    isDue = new Date() >= new Date(farm.end_date);
                } else if (stage.key === 'harvested') {
                    isDue = farm.status_name === 'Harvesting';
                }

                if (isDue) {
                    setFertilizerPrompt({
                        isOpen: true,
                        farm: farm,
                        stage: stage,
                        applied: 'yes',
                        appliedDate: formatPHDate(new Date()),
                        fertilizersUsed: stage.details || ''
                    });
                    return; // Open the first actionable activity found
                }
            }
        }
    }, []);

    const fetchFarmerData = useCallback(async (uid) => {
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

            let calibratedBatches = [];

            if (batchData && hasValidCoordinates) {
                calibratedBatches = await Promise.all(
                    batchData.map(async (farm) => {
                        const todayPHString = formatPHDate(new Date());
                        const daysElapsed = Math.floor(
                            (parseDateOnlyUTC(todayPHString) - parseDateOnlyUTC(farm.start_date)) / 86400000
                        );

                        const pastPhasesSealedDelay = Number(farm.current_delay) || 0;
                        let activePhaseDelay = 0;

                        if (farm.progress < 15 && daysElapsed > 30) {
                            activePhaseDelay = daysElapsed - 30;
                        } else if (farm.progress < 30 && daysElapsed > 120) {
                            activePhaseDelay = daysElapsed - 120;
                        } else if (farm.progress < 45 && daysElapsed > 210) {
                            activePhaseDelay = daysElapsed - 210;
                        } else if (farm.progress < 60 && daysElapsed > 300) {
                            activePhaseDelay = daysElapsed - 300;
                        } else if (farm.progress < 75 && daysElapsed > 340) {
                            activePhaseDelay = daysElapsed - 340;
                        }

                        const totalLiveDelay = pastPhasesSealedDelay;

                        let weatherDecisionDaysShift = 0;
                        if (daysElapsed > 0) {
                            weatherDecisionDaysShift = await calculateHybridClimateShift(
                                farm.start_date,
                                userRow.latitude,
                                userRow.longitude
                            );
                        }

                        const baseEndDate = new Date(farm.start_date);
                        baseEndDate.setMonth(baseEndDate.getMonth() + 18);

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
                checkAndTriggerPendingActivity(calibratedBatches);
            } else {
                setFarms(batchData || []);
                if (batchData) checkAndTriggerPendingActivity(batchData);
            }
        } catch (error) {
            console.error('Data calibration pipeline error:', error.message);
        }
    }, [checkAndTriggerPendingActivity]);

    useEffect(() => {
        const now = new Date().toLocaleDateString('en-PH', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
        });
        setDateStr(now);

        const fetchSessionAndVerify = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                navigate('/', { replace: true });
                return;
            }

            const { data: userRow } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();

            if (!userRow || userRow.role !== 'farmer') {
                alert("Access Denied: Restricted for Partner Farmers only.");
                await supabase.auth.signOut();
                navigate('/', { replace: true });
                return;
            }

            setUserId(session.user.id);
            fetchFarmerData(session.user.id);
        };

        fetchSessionAndVerify();
    }, [navigate, fetchFarmerData]);

    const handleFarmerSignOut = async () => {
        if (window.confirm("Are you sure you want to log out of your Farmer Portal?")) {
            try {
                await supabase.auth.signOut();
                localStorage.clear();
                sessionStorage.clear();
                navigate('/', { replace: true });
            } catch (error) {
                console.error("Logout Error:", error.message);
                alert("Failed to log out cleanly.");
            }
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
                archiveSucceeded = true;
            }

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

    const generateBatchId = async (pDate) => {
        const d = new Date(pDate);
        const year = d.getFullYear().toString().slice(-2);
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const prefix = `${year}-${month}`;

        const { data: allFarms, error } = await supabase
            .from('farm')
            .select('batch_id')
            .like('batch_id', `${prefix}-%`);

        if (error) {
            console.error("Error generating batch ID:", error);
            return `${prefix}-0001`;
        }

        const nextCount = (allFarms ? allFarms.length : 0) + 1;
        return `${prefix}-${nextCount.toString().padStart(4, '0')}`;
    };

    const handleSaveBatch = async (e) => {
        e.preventDefault();
        if (!plantingDate || !userId) return;

        const todayStr = formatPHDate(new Date());
        const daysElapsed = Math.floor(
            (parseDateOnlyUTC(todayStr) - parseDateOnlyUTC(plantingDate)) / 86400000
        );

        const generatedBatchId = await generateBatchId(plantingDate);

        // 18-month default cycle
        const startDateObj = new Date(plantingDate);
        const endDateObj = new Date(startDateObj);
        endDateObj.setMonth(endDateObj.getMonth() + 18);

        const basePayload = {
            user_id: userId,
            batch_id: generatedBatchId,
            farm_name: farmerProfile.fixedLocation,
            owner_name: farmerProfile.name,
            contact_number: farmerProfile.contactNumber,
            start_date: startDateObj.toISOString().split('T')[0],
            end_date: endDateObj.toISOString().split('T')[0],
            status_name: 'Vegetative',
            progress: 0,
            current_delay: 0,
            planting_material: 'Saha (Sucker)'
        };

        if (daysElapsed > 0) {
            // BACKDATED: The planting date is in the past
            const pastStages = CROP_STAGES.filter(s => s.minDays <= daysElapsed && s.key !== 'harvested');

            if (pastStages.length > 0) {
                const initialChecked = {};
                pastStages.forEach(s => { initialChecked[s.key] = false; });

                setPlantingAudit({
                    isOpen: true,
                    isBackdated: true,
                    daysElapsed,
                    elapsedStages: pastStages,
                    checkedStages: initialChecked,
                    basalWeedControl: true,
                    sahaGraded: true,
                    pendingBatchPayload: basePayload
                });
                return;
            }
        }

        // PLANTED TODAY (or immediate registration)
        setPlantingAudit({
            isOpen: true,
            isBackdated: false,
            daysElapsed: Math.max(0, daysElapsed),
            elapsedStages: [],
            checkedStages: {},
            basalWeedControl: false,
            sahaGraded: true,
            pendingBatchPayload: basePayload
        });
    };

    const handleConfirmPlantingAudit = async (e) => {
        e.preventDefault();
        const { isBackdated, checkedStages, elapsedStages, pendingBatchPayload, basalWeedControl, sahaGraded } = plantingAudit;
        if (!pendingBatchPayload) return;

        let initialProgress = 0;
        let initialStatus = 'Vegetative';
        let calculatedDelay = 0;
        const completedActivities = [];

        if (isBackdated) {
            elapsedStages.forEach((stage) => {
                const wasDone = checkedStages[stage.key];
                if (wasDone) {
                    initialProgress = Math.max(initialProgress, stage.progress);
                    initialStatus = stage.status;
                    completedActivities.push(stage.name);
                } else {
                    // Skipped stages add 21 days penalty each
                    calculatedDelay += 21;
                }
            });
        }

        const finalEndDateObj = new Date(pendingBatchPayload.end_date);
        if (calculatedDelay > 0) {
            finalEndDateObj.setDate(finalEndDateObj.getDate() + calculatedDelay);
        }

        const finalPayload = {
            ...pendingBatchPayload,
            progress: initialProgress,
            status_name: initialStatus,
            current_delay: calculatedDelay,
            end_date: finalEndDateObj.toISOString().split('T')[0],
            last_fertilizer_log: JSON.stringify({
                material: 'Saha (Sucker)',
                sahaGraded,
                basalWeedControl,
                retroactiveStages: completedActivities,
                skippedStagesCount: elapsedStages.length - completedActivities.length,
                loggedAt: formatPHDate(new Date())
            })
        };

        const { data, error } = await supabase.from('farm').insert([finalPayload]).select();
        if (error) {
            alert("Database Error: " + error.message);
        } else if (data) {
            fetchFarmerData(userId);
            setPlantingDate('');
            setEstimatedHarvest('');
            setPlantingAudit(prev => ({ ...prev, isOpen: false }));
        }
    };

    const filteredFarms = farms.filter(farm => {
        const batchMatch = (farm.batch_id || '').toLowerCase().includes(searchQuery.toLowerCase());
        const statusMatch = (farm.status_name || '').toLowerCase().includes(searchQuery.toLowerCase());

        const matchesSearch = batchMatch || statusMatch;
        const matchesDropdown = statusFilter === 'ALL' || (farm.status_name || '').toUpperCase() === statusFilter;

        return matchesSearch && matchesDropdown;
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

    useEffect(() => {
        updateTimelineEngine(filteredFarms);
    }, [farms, searchQuery, statusFilter]);

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
            if (s.includes('harvested')) phaseClass = 'bar-harvested';
            else if (s.includes('harvest')) phaseClass = 'bar-harvest';
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
            dateObj.setMonth(dateObj.getMonth() + 18);
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

    const handleConfirmFertilizer = async (e) => {
        e.preventDefault();
        const { farm, stage, applied, appliedDate } = fertilizerPrompt;

        let calculatedDelay = 0;

        if (applied === 'yes' || applied === 'partial') {
            const startTimestamp = parseDateOnlyUTC(farm.start_date);
            const appliedTimestamp = parseDateOnlyUTC(appliedDate);
            const actualDaysElapsed = Math.floor((appliedTimestamp - startTimestamp) / 86400000);
            calculatedDelay = Math.max(0, actualDaysElapsed - stage.minDays);
        } else if (applied === 'no') {
            calculatedDelay = 30; // Vegetative cycle delay penalty
            alert("Notice: Skipping this recommended application delays canopy development and shifts projected harvest by 30 days.");
        }

        await executeActivityUpdate(farm, stage, calculatedDelay, {
            applied,
            appliedDate,
            inputs: fertilizerPrompt.fertilizersUsed,
            delayLogged: calculatedDelay
        });

        // Close prompt and evaluate remaining batches
        setFertilizerPrompt(prev => ({ ...prev, isOpen: false }));
    };

    const executeActivityUpdate = async (farm, stage, extraDelay = 0, fertLog = null) => {
        const currentDelay = (Number(farm.current_delay) || 0) + extraDelay;

        const updatePayload = {
            status_name: stage.status,
            progress: stage.progress,
            current_delay: currentDelay,
            ...(stage.key === 'harvested' && { harvested_date: formatPHDate(new Date()) }),
            ...(fertLog && { last_fertilizer_log: JSON.stringify(fertLog) })
        };

        const { error } = await supabase.from('farm').update(updatePayload).eq('id', farm.id);
        if (!error) fetchFarmerData(userId);
    };

    return (
        <div className="farmer-portal bg-light min-vh-100">
            <nav className="navbar navbar-dark p-3 shadow-sm bg-lpmpc-green" style={{ backgroundColor: '#468432' }}>
                <div className="container-fluid">
                    <h4 className="fw-bold m-0 text-white">LPMPC Farmer Portal</h4>
                    <div className="d-flex align-items-center gap-2">
                        <button type="button" className="btn btn-sm btn-outline-light rounded-3 px-3 fw-bold text-uppercase" style={{ fontSize: '11px' }} data-bs-toggle="modal" data-bs-target="#settingsModal">Settings</button>
                        <button type="button" className="btn btn-sm btn-outline-light rounded-3 px-3 fw-bold text-uppercase" style={{ fontSize: '11px', color: '#ffffff' }} onClick={handleFarmerSignOut}>Sign Out</button>
                    </div>
                </div>
            </nav>

            <div className="container py-4">
                <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-end gap-2 mb-4">
                    <div><h2 className="fw-bold m-0 text-uppercase lpmpc-green fs-4" style={{ color: '#468432' }}>BATCH MANAGEMENT</h2></div>
                    <div className="date-display fw-bold text-uppercase small lpmpc-green" style={{ color: '#468432' }}>{dateStr}</div>
                </div>

                <div className="card border-0 rounded-0 mb-3 p-3 bg-white">
                    <input type="text" className="form-control" placeholder="Search batch ID..." value={searchQuery} onChange={filterTimeline} />
                </div>

                <div className="card border-0 rounded-0 shadow-sm bg-white overflow-hidden mb-4">
                    <div className="card-body p-0"><div ref={timelineContainer} style={{ width: '100%', overflowX: 'auto' }}></div></div>
                </div>

                <div className="row g-4">
                    <div className="col-12 col-lg-4">
                        <div className="card border-0 rounded-0 shadow-sm bg-white h-100">
                            <div className="card-header bg-light border-bottom rounded-0 py-3">
                                <h5 className="fw-bold m-0 small text-uppercase" style={{ color: '#468432' }}>Log Crop Production Batch</h5>
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
                                    <button type="submit" className="btn w-100 rounded-0 text-uppercase fw-bold py-2 shadow-sm text-white" style={{ backgroundColor: '#468432' }}>Save Production Batch</button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <div className="col-12 col-lg-8">
                        <div className="card border-0 rounded-0 shadow-sm bg-white h-100">
                            <div className="card-header bg-light border-bottom rounded-0 py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                                <h5 className="fw-bold m-0 small text-uppercase">Active Farm Batches</h5>

                                <div className="d-flex align-items-center gap-2">
                                    <span className="small text-muted fw-bold text-uppercase" style={{ fontSize: '11px' }}>Filter Status:</span>
                                    <select
                                        className="form-select form-select-sm rounded-0 border-secondary fw-bold text-uppercase"
                                        style={{ fontSize: '11px', width: '150px' }}
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                    >
                                        <option value="ALL">All Batches</option>
                                        <option value="VEGETATIVE">Vegetative</option>
                                        <option value="FLOWERING">Flowering</option>
                                        <option value="MATURATION">Maturation</option>
                                        <option value="HARVESTING">Harvesting</option>
                                        <option value="HARVESTED">Harvested</option>
                                    </select>
                                </div>
                            </div>

                            <div className="table-responsive">
                                <table className="table table-hover align-middle mb-0">
                                    <thead className="table-light text-uppercase small fw-bold">
                                        <tr>
                                            <th className="ps-4">Batch ID</th><th>Planting Date</th><th>Status</th><th>Progress</th><th>Harvest Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredFarms.length > 0 ? (
                                            filteredFarms.map((farm) => {
                                                const s = (farm.status_name || 'vegetative').toLowerCase();
                                                const badgeColors = {
                                                    vegetative: 'bg-success text-white',
                                                    flowering: 'bg-pink text-white',
                                                    maturation: 'bg-warning text-dark',
                                                    harvesting: 'bg-info text-white',
                                                    harvested: 'bg-secondary text-white'
                                                };
                                                const badgeClass = badgeColors[s] || 'bg-success text-white';

                                                return (
                                                    <tr key={farm.id}>
                                                        <td className="ps-4 fw-bold">{farm.batch_id}</td>
                                                        <td>{farm.start_date ? new Date(farm.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}</td>
                                                        <td><span className={`badge px-2 py-1 ${badgeClass}`}>{farm.status_name || 'Vegetative'}</span></td>
                                                        <td><div className="d-flex align-items-center justify-content-center text-white fw-bold rounded" style={{ backgroundColor: '#468432', width: '80px', height: '30px', fontSize: '0.85rem' }}>{farm.progress || 0}%</div></td>
                                                        <td className="fw-bold text-secondary small">
                                                            {farm.status_name === 'Harvested' ? (
                                                                <span className="text-success">
                                                                    {farm.harvested_date
                                                                        ? `Harvested on: ${new Date(farm.harvested_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                                                        : 'Harvested (Completed)'}
                                                                </span>
                                                            ) : (
                                                                <span>Pred: {farm.end_date ? new Date(farm.end_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr><td colSpan="5" className="text-center py-4 text-muted small">No farm batches found matching criteria.</td></tr>
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
                            <h6 className="modal-title fw-bold text-uppercase" style={{ color: '#468432' }} id="settingsModalLabel">Account Settings</h6>
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
                                        <button type="submit" className="btn btn-sm rounded-0 text-uppercase fw-bold px-3 text-white" style={{ backgroundColor: '#468432' }}>Update Credentials</button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* PLACE THIS DIRECTLY BEFORE fertilizerPrompt.isOpen */}
            {plantingAudit.isOpen && (
                <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
                    <div className="modal-dialog modal-dialog-centered modal-lg">
                        <div className="modal-content rounded-0 border shadow-lg">
                            <div className="modal-header bg-success text-white rounded-0">
                                <h6 className="modal-title fw-bold text-uppercase">
                                    🌱 Saha Planting Verification: {plantingAudit.pendingBatchPayload?.batch_id}
                                </h6>
                                <button type="button" className="btn-close btn-close-white" onClick={() => setPlantingAudit(p => ({ ...p, isOpen: false }))}></button>
                            </div>
                            <form onSubmit={handleConfirmPlantingAudit}>
                                <div className="modal-body p-4">
                                    {plantingAudit.isBackdated ? (
                                        <>
                                            <div className="alert alert-warning border small mb-3">
                                                <strong>Naitanim na ang mga Saha ({plantingAudit.daysElapsed} araw na ang nakalipas):</strong><br />
                                                Pakitsek ang lahat ng abono at pamamaraan na <strong>nailagay o naisagawa na</strong> simula nang itanim ang saha. Ang mga hindi matse-tsekan ay itatala bilang pagkaantala (delay) sa anihan.
                                            </div>

                                            <label className="form-label small fw-bold text-uppercase text-muted">
                                                Mga Natapos nang Aplikasyon sa Saha:
                                            </label>
                                            <div className="list-group rounded-0 mb-3">
                                                {plantingAudit.elapsedStages.map((stage) => (
                                                    <label key={stage.key} className="list-group-item d-flex gap-3 align-items-start cursor-pointer">
                                                        <input
                                                            className="form-check-input flex-shrink-0 mt-1"
                                                            type="checkbox"
                                                            checked={!!plantingAudit.checkedStages[stage.key]}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setPlantingAudit(prev => ({
                                                                    ...prev,
                                                                    checkedStages: {
                                                                        ...prev.checkedStages,
                                                                        [stage.key]: checked
                                                                    }
                                                                }));
                                                            }}
                                                        />
                                                        <div className="w-100">
                                                            <div className="fw-bold">{stage.name}</div>
                                                            <div className="small text-muted">{stage.details}</div>
                                                            <span className="badge bg-light text-secondary border mt-1">Takdang Araw: Day {stage.minDays}</span>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="alert alert-info border small mb-3">
                                                <strong>Bagong Tanom na Saha (Planted Today):</strong><br />
                                                Ang saha ay nangangailangan ng agarang proteksyon laban sa damo at tamang kondisyon ng lupa para mabilis mag-ugat sa unang 30 araw.
                                            </div>

                                            <div className="card p-3 rounded-0 bg-light border mb-3">
                                                <h6 className="fw-bold small text-uppercase mb-2">Pagtatanim at Paglalagay ng Proteksyon:</h6>

                                                <div className="form-check mb-2">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        id="weedCheck"
                                                        checked={plantingAudit.basalWeedControl}
                                                        onChange={(e) => setPlantingAudit(p => ({ ...p, basalWeedControl: e.target.checked }))}
                                                    />
                                                    <label className="form-check-label small fw-bold" htmlFor="weedCheck">
                                                        Nag-spray ng Diuron / Pre-emergence herbicide (2 kg/ha) pagkatanim ng saha
                                                    </label>
                                                </div>

                                                <div className="form-check">
                                                    <input
                                                        className="form-check-input"
                                                        type="checkbox"
                                                        id="curedCheck"
                                                        checked={plantingAudit.sahaGraded}
                                                        onChange={(e) => setPlantingAudit(p => ({ ...p, sahaGraded: e.target.checked }))}
                                                    />
                                                    <label className="form-check-label small fw-bold" htmlFor="curedCheck">
                                                        Ang mga saha ay napili/napapatuyo (cured & sorted by size) bago ibinaon
                                                    </label>
                                                </div>
                                                <small className="text-muted mt-2 d-block">
                                                    Paalala: Ang <strong>1st Fertilization</strong> (Ammophos + Complete + Urea) ay awtomatikong magiging aktibo sa <strong>ika-30 araw</strong> (Month 1) matapos mag-ugat ang saha.
                                                </small>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="modal-footer bg-light">
                                    <button type="button" className="btn btn-secondary rounded-0" onClick={() => setPlantingAudit(p => ({ ...p, isOpen: false }))}>Kanselahin</button>
                                    <button type="submit" className="btn btn-success rounded-0 fw-bold">I-save at Kalkulahin ang Ani</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* AUTOMATICALLY OPENED MODAL UPON SYSTEM ENTRY IF A STAGE IS DUE */}
            {fertilizerPrompt.isOpen && (
                <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-0 border shadow-lg">
                            <div className="modal-header bg-success text-white rounded-0">
                                <h6 className="modal-title fw-bold text-uppercase">
                                    Mandatory Update: Batch {fertilizerPrompt.farm?.batch_id}
                                </h6>
                                <button className="btn-close btn-close-white" onClick={() => setFertilizerPrompt(prev => ({ ...prev, isOpen: false }))}></button>
                            </div>
                            <form onSubmit={handleConfirmFertilizer}>
                                <div className="modal-body p-4">
                                    <div className="badge bg-light text-success border border-success p-2 mb-3 text-uppercase fw-bold">
                                        Current Stage Due: {fertilizerPrompt.stage?.name}
                                    </div>

                                    {fertilizerPrompt.stage?.details && (
                                        <div className="alert alert-light border small text-muted mb-3">
                                            <strong>Formosa Standard Inputs:</strong> {fertilizerPrompt.stage?.details}
                                        </div>
                                    )}

                                    <div className="mb-3">
                                        <label className="form-label small fw-bold text-uppercase">
                                            {fertilizerPrompt.stage?.key.startsWith('fert_')
                                                ? "Did you undertake this fertilizer application?"
                                                : "Did you complete this stage activity?"}
                                        </label>
                                        <select
                                            className="form-select rounded-0"
                                            value={fertilizerPrompt.applied}
                                            onChange={(e) => setFertilizerPrompt(p => ({ ...p, applied: e.target.value }))}
                                        >
                                            <option value="yes">Yes, completed as scheduled</option>
                                            <option value="partial">Partially applied / alternative inputs used</option>
                                            <option value="no">No, skipped this application</option>
                                        </select>
                                    </div>

                                    {fertilizerPrompt.applied !== 'no' && (
                                        <>
                                            <div className="mb-3">
                                                <label className="form-label small fw-bold text-uppercase">Actual Date Completed</label>
                                                <input
                                                    type="date"
                                                    className="form-control rounded-0"
                                                    value={fertilizerPrompt.appliedDate}
                                                    onChange={(e) => setFertilizerPrompt(p => ({ ...p, appliedDate: e.target.value }))}
                                                    required
                                                />
                                            </div>
                                            <div className="mb-3">
                                                <label className="form-label small fw-bold text-uppercase">Fertilizers / Methods Applied</label>
                                                <input
                                                    type="text"
                                                    className="form-control rounded-0"
                                                    value={fertilizerPrompt.fertilizersUsed}
                                                    onChange={(e) => setFertilizerPrompt(p => ({ ...p, fertilizersUsed: e.target.value }))}
                                                    placeholder="e.g. Urea 46-0-0, Complete 14-14-14"
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="modal-footer bg-light">
                                    <button type="button" className="btn btn-secondary rounded-0" onClick={() => setFertilizerPrompt(p => ({ ...p, isOpen: false }))}>Postpone / Remind Later</button>
                                    <button type="submit" className="btn btn-success rounded-0 fw-bold">Confirm & Recalibrate Harvest</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FarmerDashboard;