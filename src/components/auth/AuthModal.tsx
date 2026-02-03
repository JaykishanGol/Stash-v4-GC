import { useState } from 'react';
import { X, Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

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
        <div className="modal-overlay active" onClick={onClose}>
            <div
                className="modal"
                style={{ maxWidth: 420, borderRadius: 16 }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '24px 24px 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                }}>
                    <div>
                        <h2 style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            margin: 0,
                            color: '#1F2937',
                        }}>
                            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                        </h2>
                        <p style={{
                            color: '#6B7280',
                            margin: '8px 0 0',
                            fontSize: '0.875rem',
                        }}>
                            {mode === 'login'
                                ? 'Sign in to sync your data'
                                : 'Get started with Stash'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            color: '#9CA3AF',
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: '24px 24px 0' }}>
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
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={e => e.currentTarget.style.borderColor = '#D1D5DB'}
                        onMouseOut={e => e.currentTarget.style.borderColor = '#E5E7EB'}
                    >
                        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" width="20" height="20" />
                        Continue with Google
                    </button>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        margin: '20px 0 0',
                    }}>
                        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                        <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>or email</span>
                        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ padding: 24 }}>
                    {/* Email */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#374151',
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
                                    border: '2px solid #E5E7EB',
                                    borderRadius: 10,
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                    transition: 'border-color 0.15s',
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#F59E0B'}
                                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div style={{ marginBottom: 20 }}>
                        <label style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#374151',
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
                                border: '2px solid #E5E7EB',
                                borderRadius: 10,
                                outline: 'none',
                                fontFamily: 'inherit',
                                transition: 'border-color 0.15s',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#F59E0B'}
                            onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
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
                        style={{
                            width: '100%',
                            padding: '12px 20px',
                            fontSize: '0.9375rem',
                            fontWeight: 600,
                            color: 'white',
                            background: status === 'loading' ? '#9CA3AF' : '#F59E0B',
                            border: 'none',
                            borderRadius: 10,
                            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            transition: 'background 0.15s',
                        }}
                    >
                        {status === 'loading' && <Loader2 size={18} className="animate-spin" />}
                        {mode === 'login' ? 'Sign In' : 'Create Account'}
                    </button>

                    {/* Divider */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        margin: '20px 0',
                    }}>
                        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                        <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>or</span>
                        <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                    </div>

                    {/* Magic Link */}
                    <button
                        type="button"
                        onClick={handleMagicLink}
                        disabled={status === 'loading'}
                        style={{
                            width: '100%',
                            padding: '12px 20px',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: '#374151',
                            background: '#F3F4F6',
                            border: 'none',
                            borderRadius: 10,
                            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                        }}
                    >
                        Send Magic Link
                    </button>
                </form>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px 24px',
                    textAlign: 'center',
                    borderTop: '1px solid #F3F4F6',
                }}>
                    <span style={{ color: '#6B7280', fontSize: '0.875rem' }}>
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
                            color: '#F59E0B',
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
