import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

const supabaseUrl = 'https://bqblzvgwkvdkanobntgn.supabase.co';
const supabaseKey = 'sb_publishable_cKKlFv0eCaArfywT-fqzaQ_QEXrLLbm';
const supabase = createClient(supabaseUrl, supabaseKey);

const AdminLogin = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Siguraduhing malinis at walang lumang session kapag binuksan ang login page
    useEffect(() => {
        const clearOldSession = async () => {
            await supabase.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
        };
        clearOldSession();
    }, []);

    const handleAdminLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // 1. Authenticate credentials sa Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            // 2. I-verify sa database kung tunay na Admin (role === 'admin')
            const { data: profile, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('id', authData.user.id)
                .single();

            if (dbError) throw dbError;

            if (profile && profile.role === "admin") {
                alert("Authentication Successful! Welcome to LPMPC Admin Portal.");
                // Papasukin sa Dashboard at ire-replace ang URL history
                navigate('/admin', { replace: true });
            } else {
                alert("Access Denied: This account does not have Administrator privileges.");
                await supabase.auth.signOut();
                localStorage.clear();
            }
        } catch (err) {
            alert("Login Failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="vh-100 w-100 bg-dark d-flex align-items-center justify-content-center text-white p-3" style={{ background: 'linear-gradient(135deg, #1e1e24 0%, #0d1b1e 100%)' }}>
            <div className="card border-0 rounded-4 shadow-lg p-4 p-md-5 bg-white text-dark text-center" style={{ maxWidth: '420px', width: '100%' }}>

                <img src="/logo.png" alt="LPMPC Logo" width="80" className="rounded-circle bg-light p-2 mx-auto mb-3 shadow-sm" />
                <h4 className="fw-bold text-success mb-1">LPMPC Admin Portal</h4>
                <p className="text-muted small mb-4">Secret Backdoor Authentication</p>

                <form onSubmit={handleAdminLogin} className="text-start">
                    <div className="mb-3">
                        <label className="form-label small fw-bold text-muted">ADMIN EMAIL</label>
                        <input
                            type="email"
                            className="form-control rounded-3"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="@gmail.com"
                            required
                        />
                    </div>
                    <div className="mb-4">
                        <label className="form-label small fw-bold text-muted">SECURITY PASSWORD</label>
                        <input
                            type="password"
                            className="form-control rounded-3"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <div className="d-grid gap-2">
                        <button type="submit" className="btn btn-success py-2 fw-bold rounded-pill text-uppercase" disabled={loading} style={{ backgroundColor: '#468432', border: 'none', letterSpacing: '0.5px' }}>
                            {loading ? <span className="spinner-border spinner-border-sm"></span> : 'Log In to Dashboard'}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
};

export default AdminLogin;