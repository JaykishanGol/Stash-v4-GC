import { useState } from 'react';
import { X, User, LogOut, Settings, Laptop, LogIn, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function SettingsModal() {
    const { isSettingsModalOpen, toggleSettingsModal, user, signOut, openAuthModal, theme, toggleTheme } = useAppStore();
    const [activeTab, setActiveTab] = useState<'general' | 'account'>('account');

    if (!isSettingsModalOpen) return null;

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            toggleSettingsModal();
        }
    };

    const isGuest = !user || user.email === 'demo@local';

    return (
        <div className="modal-overlay active" onClick={handleBackdropClick} style={{ zIndex: 999 }}>
            <div className="modal" style={{ width: 500, maxWidth: '95vw', height: 'auto', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Settings size={20} />
                        Settings
                    </h2>
                    <button className="modal-close" onClick={toggleSettingsModal}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB' }}>
                    <button
                        onClick={() => setActiveTab('account')}
                        style={{
                            padding: '12px 20px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === 'account' ? '2px solid #2563EB' : '2px solid transparent',
                            color: activeTab === 'account' ? '#2563EB' : '#6B7280',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8
                        }}
                    >
                        <User size={16} /> Account
                    </button>
                    <button
                        onClick={() => setActiveTab('general')}
                        style={{
                            padding: '12px 20px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === 'general' ? '2px solid #2563EB' : '2px solid transparent',
                            color: activeTab === 'general' ? '#2563EB' : '#6B7280',
                            fontWeight: 500,
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8
                        }}
                    >
                        <Laptop size={16} /> General
                    </button>
                </div>

                <div className="modal-body" style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
                    {activeTab === 'account' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: '50%',
                                    background: isGuest ? '#F3F4F6' : '#EFF6FF',
                                    color: isGuest ? '#9CA3AF' : '#2563EB',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 24, fontWeight: 600
                                }}>
                                    {isGuest ? <User size={32} /> : user?.email?.[0].toUpperCase()}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>
                                        {isGuest ? 'Guest User' : user?.email}
                                    </h3>
                                    <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.9rem' }}>
                                        {isGuest ? 'Local data storage only' : 'Pro Plan Member'}
                                    </p>
                                </div>
                            </div>

                            {isGuest ? (
                                <div style={{ background: '#F9FAFB', padding: 20, borderRadius: 12, border: '1px solid #E5E7EB' }}>
                                    <h4 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#374151' }}>Sync your data</h4>
                                    <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: '#6B7280', lineHeight: 1.5 }}>
                                        Sign in to sync your items across devices and access premium features.
                                    </p>
                                    <button
                                        onClick={() => { toggleSettingsModal(); openAuthModal(); }}
                                        className="btn btn-primary"
                                        style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                                    >
                                        <LogIn size={18} /> Sign In / Sign Up
                                    </button>
                                </div>
                            ) : (
                                <div style={{ background: '#F9FAFB', padding: 20, borderRadius: 12, border: '1px solid #E5E7EB' }}>
                                    <h4 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#374151' }}>Session Management</h4>
                                    <button
                                        onClick={() => { signOut(); toggleSettingsModal(); }}
                                        className="btn"
                                        style={{
                                            width: '100%', justifyContent: 'center', padding: '10px',
                                            border: '1px solid #D1D5DB', background: 'white', color: '#EF4444'
                                        }}
                                    >
                                        <LogOut size={18} /> Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'general' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {/* Theme Toggle */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#374151' }}>Appearance</h4>
                                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#6B7280' }}>
                                        Toggle between light and dark mode
                                    </p>
                                </div>
                                <button
                                    onClick={toggleTheme}
                                    style={{
                                        padding: '8px 16px', borderRadius: 8,
                                        border: '1px solid #D1D5DB', background: 'white',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        cursor: 'pointer', color: '#374151'
                                    }}
                                >
                                    {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                                    {theme === 'dark' ? 'Dark' : 'Light'}
                                </button>
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid #E5E7EB', margin: 0 }} />

                            {/* About */}
                            <div>
                                <h4 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#374151' }}>About Stash</h4>
                                <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: 8 }}>
                                    Version 4.0.0 (Beta)
                                </p>
                                <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>
                                    Designed for maximum productivity.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
