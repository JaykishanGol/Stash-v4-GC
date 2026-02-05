import { useEffect, useState } from 'react';
import { X, Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type AuthMode = 'login' | 'signup';
type AuthStatus = 'idle' | 'loading' | 'success' | 'error';

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [status, setStatus] = useState<AuthStatus>('idle');
    const [message, setMessage] = useState('');

    // Close sidebar on mobile when modal opens
    useEffect(() => {
        if (isOpen && window.innerWidth < 768) {
            useAppStore.setState({ isSidebarOpen: false });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isSupabaseConfigured()) {
            setStatus('error');
            setMessage('Supabase is not configured. Please add your credentials to .env');
            return;
        }

        setStatus('loading');
        setMessage('');

        try {
            if (mode === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin,
                    },
                });

                if (error) throw error;

                setStatus('success');
                setMessage('Check your email for verification link!');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;

                setStatus('success');
                setMessage('Login successful!');
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 500);
            }
        } catch (error: unknown) {
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'An error occurred');
        }
    };

    const handleMagicLink = async () => {
        if (!email) {
            setStatus('error');
            setMessage('Please enter your email');
            return;
        }

        if (!isSupabaseConfigured()) {
            setStatus('error');
            setMessage('Supabase is not configured');
            return;
        }

        setStatus('loading');

        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: window.location.origin,
                },
            });

            if (error) throw error;

            setStatus('success');
            setMessage('Magic link sent! Check your email.');
        } catch (error: unknown) {
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'An error occurred');
        }
    };

    return (
        <div className="modal-overlay active" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal" style={{ width: 'min(420px, 90vw)', maxWidth: 420, zIndex: 9999, position: 'relative' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">
                            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                        </h2>
                        <p style={{
                            color: 'var(--text-secondary)',
                            margin: '4px 0 0',
                            fontSize: '0.875rem',
                        }}>
                            {mode === 'login'
                                ? 'Sign in to sync your data'
                                : 'Get started with Stash'}
                        </p>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <button
                        type="button"
                        onClick={async () => {
                            if (!isSupabaseConfigured()) {
                                setStatus('error');
                                setMessage('Supabase is not configured');
                                return;
                            }
                            try {
                                const { error } = await supabase.auth.signInWithOAuth({
                                    provider: 'google',
                                    options: {
                                        redirectTo: window.location.origin,
                                        scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks'
                                    }
                                });
                                if (error) throw error;
                            } catch (e: any) {
                                setStatus('error');
                                setMessage(e.message);
                            }
                        }}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'white',
                            color: '#374151',
                            border: '1px solid #E5E7EB',
                            borderRadius: 10,
                            fontWeight: 600,
                            fontSize: '0.9375rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 12,
                            transition: 'all 0.2s',
                            marginBottom: '20px'
                        }}
                    >
                        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" width="20" height="20" />
                        Continue with Google
                    </button>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: '20px',
                    }}>
                        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                        <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>or email</span>
                        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit}>
                        {/* Email */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{
                                display: 'block',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                marginBottom: 6,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}>
                                Email
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Mail
                                    size={18}
                                    style={{
                                        position: 'absolute',
                                        left: 14,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: '#9CA3AF',
                                    }}
                                />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '12px 14px 12px 44px',
                                        fontSize: '0.9375rem',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 8,
                                        outline: 'none',
                                    }}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={{
                                display: 'block',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                marginBottom: 6,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                            }}>
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                minLength={6}
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    fontSize: '0.9375rem',
                                    border: '1px solid var(--border-light)',
                                    borderRadius: 8,
                                    outline: 'none',
                                }}
                            />
                        </div>

                        {/* Status Message */}
                        {message && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 12px',
                                borderRadius: 8,
                                marginBottom: 16,
                                background: status === 'success' ? '#D1FAE5' : '#FEE2E2',
                                color: status === 'success' ? '#059669' : '#DC2626',
                                fontSize: '0.875rem',
                            }}>
                                {status === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                {message}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={status === 'loading'}
                            className="btn btn-primary"
                            style={{ width: '100%', justifyContent: 'center' }}
                        >
                            {status === 'loading' && <Loader2 size={18} className="animate-spin" />}
                            {mode === 'login' ? 'Sign In' : 'Create Account'}
                        </button>

                        <div style={{ height: 16 }} />

                        {/* Magic Link */}
                        <button
                            type="button"
                            onClick={handleMagicLink}
                            disabled={status === 'loading'}
                            className="btn btn-secondary"
                            style={{ width: '100%', justifyContent: 'center' }}
                        >
                            Send Magic Link
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="modal-footer" style={{ justifyContent: 'center', background: 'transparent', borderTop: '1px solid var(--border-light)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            setMode(mode === 'login' ? 'signup' : 'login');
                            setStatus('idle');
                            setMessage('');
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                        }}
                    >
                        {mode === 'login' ? 'Sign Up' : 'Sign In'}
                    </button>
                </div>
            </div>
        </div>
    );
}
