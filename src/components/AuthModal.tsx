import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  X, 
  LogOut, 
  Shield, 
  UserCheck, 
  User as UserIcon, 
  Users, 
  Edit3, 
  CheckCircle2, 
  AlertCircle,
  Send,
  RefreshCw,
  GraduationCap,
  Mail
} from 'lucide-react';
import { useAuth, UserProfile, UserRole } from '../context/useAuth';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCommitteesModal?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  onClose,
  onOpenCommitteesModal 
}) => {
  const { 
    user, 
    userProfile, 
    loading, 
    isAdmin,
    isOfficer, 
    isTxStateEmail,
    signInWithGoogle, 
    signOut, 
    updateUserRole,
    sendNetIdVerificationCode,
    verifyNetIdCode,
  } = useAuth();

  const [authError, setAuthError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [showMemberManager, setShowMemberManager] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // NetID OTP Verification State in Modal
  const [modalNetId, setModalNetId] = useState('');
  const [modalCode, setModalCode] = useState('');
  const [modalStep, setModalStep] = useState<'send_code' | 'enter_code'>('send_code');
  const [modalIsSubmitting, setModalIsSubmitting] = useState(false);
  const [modalIsVerifying, setModalIsVerifying] = useState(false);
  const [modalNetIdMsg, setModalNetIdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !isOfficer) return;
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((d) => users.push(d.data() as UserProfile));
      setAllUsers(users);
    });
    return () => unsub();
  }, [isOpen, isOfficer]);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      if (errObj.code !== 'auth/popup-closed-by-user') {
        if (errObj.code === 'auth/unauthorized-domain') {
          setAuthError('This domain is not authorized in Firebase Authentication. Please check Firebase Auth settings.');
        } else {
          setAuthError(errObj.message || 'Google sign-in failed. Please try again.');
        }
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Failed to sign out.');
    }
  };

  const handleRoleChange = async (targetUid: string, role: UserRole) => {
    try {
      await updateUserRole(targetUid, role);
      setActionSuccess(`Role updated to ${role.replace('_', ' ')}.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: unknown) {
      setAuthError('Failed to update role: ' + (err instanceof Error ? err.message : 'Permission denied'));
    }
  };

  const handleModalSubmitNetId = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = modalNetId.trim().toLowerCase();
    if (!clean || !/^[a-z0-9]+$/i.test(clean)) {
      setModalNetIdMsg({
        type: 'error',
        text: 'Please enter a valid alphanumeric Texas State NetID (e.g. abc12).',
      });
      return;
    }

    setModalIsSubmitting(true);
    setModalNetIdMsg(null);
    try {
      const res = await sendNetIdVerificationCode(clean);
      setModalStep('enter_code');
      setModalCode('');
      setModalNetIdMsg({ 
        type: res.delivered ? 'success' : res.deliveryError ? 'error' : 'success', 
        text: res.message 
      });
    } catch (err: unknown) {
      setModalStep('enter_code');
      setModalNetIdMsg({
        type: 'error',
        text: err instanceof Error ? err.message : `Failed to send verification code to ${clean}@txstate.edu`,
      });
    } finally {
      setModalIsSubmitting(false);
    }
  };

  const handleModalVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = modalCode.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setModalNetIdMsg({
        type: 'error',
        text: 'Please enter the complete 6-digit numeric verification code.',
      });
      return;
    }

    setModalIsVerifying(true);
    setModalNetIdMsg(null);
    try {
      const res = await verifyNetIdCode(cleanCode);
      setModalNetIdMsg({
        type: 'success',
        text: res.message || 'Texas State verification confirmed!',
      });
    } catch (err: unknown) {
      setModalNetIdMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Invalid or expired code.',
      });
    } finally {
      setModalIsVerifying(false);
    }
  };

  const handleModalResend = async () => {
    const targetNetId = userProfile?.txstateEmail || userProfile?.netid || modalNetId;
    if (!targetNetId) {
      setModalStep('send_code');
      return;
    }

    setModalIsSubmitting(true);
    setModalNetIdMsg(null);
    try {
      const res = await sendNetIdVerificationCode(targetNetId);
      setModalStep('enter_code');
      setModalCode('');
      setModalNetIdMsg({
        type: 'success',
        text: res.message || `New 6-digit verification code sent to ${res.email}!`,
      });
    } catch (err: unknown) {
      setModalNetIdMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to resend code.',
      });
    } finally {
      setModalIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-primary-600 px-6 py-5 text-white flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-white/10 p-2 rounded-xl">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Chapter Portal</h3>
              <p className="text-xs text-primary-100">SHPE Texas State Member & Officer Access</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {authError && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-xl border border-red-200 flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {actionSuccess && (
            <div className="bg-green-50 text-green-700 text-sm p-3 rounded-xl border border-green-200 flex items-center space-x-2">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {!user ? (
            /* Logged Out View */
            <div className="text-center py-4 space-y-6">
              <div className="w-16 h-16 bg-primary-50 rounded-2xl mx-auto flex items-center justify-center text-primary-600">
                <UserIcon className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold text-gray-900">Sign in with Google</h4>
                <p className="text-sm text-gray-600 max-w-sm mx-auto">
                  Access your chapter membership status, committee functions, and officer slideshow controls.
                </p>
              </div>

              {/* Roles Description Cards */}
              <div className="grid grid-cols-3 gap-2 text-left text-xs pt-2">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="font-bold text-gray-900 mb-1 flex items-center gap-1">
                    <UserIcon className="h-3.5 w-3.5 text-gray-500" /> Non-Member
                  </div>
                  <p className="text-gray-500">Initial sign-in status, event visitor</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="font-bold text-blue-900 mb-1 flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5 text-blue-600" /> Member
                  </div>
                  <p className="text-blue-700">Dues-paid voting member & merit points</p>
                </div>
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-3">
                  <div className="font-bold text-primary-900 mb-1 flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-primary-600" /> Officer
                  </div>
                  <p className="text-primary-700">Committee lead, photo uploader & slideshow manager</p>
                </div>
              </div>

              <button
                onClick={handleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-gray-50 text-gray-800 font-semibold py-3 px-4 border border-gray-300 rounded-xl shadow-sm transition-all hover:shadow"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          ) : (
            /* Logged In View */
            <div className="space-y-6">
              {/* Profile Card */}
              <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Profile'}
                    className="w-16 h-16 rounded-full border-2 border-primary-500 object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 font-bold text-2xl flex items-center justify-center">
                    {(user.displayName || user.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-bold text-gray-900 truncate">
                    {userProfile?.fullName || userProfile?.displayName || user.displayName || 'SHPE Member'}
                  </h4>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  
                  {/* Role & Committee Badges */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {isAdmin ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <Shield className="w-3 h-3 mr-1 text-emerald-600" /> Admin
                      </span>
                    ) : userProfile?.role === 'officer' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-100 text-primary-800 border border-primary-200">
                        <Shield className="w-3 h-3 mr-1" /> Officer
                      </span>
                    ) : null}
                    {userProfile?.role === 'member' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        <UserCheck className="w-3 h-3 mr-1" /> Member
                      </span>
                    )}
                    {userProfile?.role === 'non_member' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                        <UserIcon className="w-3 h-3 mr-1" /> Non-Member
                      </span>
                    )}

                    {userProfile?.isShpetinasMember && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-pink-100 text-pink-800 border border-pink-300">
                        SHPEtinas
                      </span>
                    )}

                    {userProfile?.committee && (
                      <span className="text-xs text-gray-500">
                        • {userProfile.committee}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Texas State Bobcat NetID Verification Section */}
              {!isAdmin && (
                <div className={`rounded-2xl border p-4 transition-all ${
                  isTxStateEmail 
                    ? 'bg-emerald-50/70 border-emerald-200' 
                    : 'bg-primary-50/40 border-primary-200'
                }`}>
                  {isTxStateEmail ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-emerald-800">
                          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                          <span className="text-xs font-bold">Texas State Bobcat Verified</span>
                        </div>
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                          Active
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 font-mono pl-7">
                        {userProfile?.txstateEmail || user.email}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-1.5 bg-primary-600 text-white rounded-lg shadow-xs">
                          <GraduationCap className="w-4 h-4" />
                        </div>
                        <div>
                          <h5 className="text-xs font-extrabold text-gray-900">
                            Texas State NetID Verification
                          </h5>
                          <p className="text-[11px] text-gray-600">
                            Enter your Texas State NetID to verify your @txstate.edu account
                          </p>
                        </div>
                      </div>

                      {modalNetIdMsg && (
                        <div className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
                          modalNetIdMsg.type === 'success'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}>
                          {modalNetIdMsg.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
                          )}
                          <span className="font-medium text-[11px]">{modalNetIdMsg.text}</span>
                        </div>
                      )}

                      {modalStep === 'enter_code' ? (
                        <div className="space-y-3 bg-white p-3.5 rounded-xl border border-primary-200 text-xs">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-gray-600">
                              Verification code sent to: <strong className="font-mono text-primary-700">{userProfile?.txstateEmail || (modalNetId ? `${modalNetId}@txstate.edu` : user.email)}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setModalStep('send_code');
                                setModalNetIdMsg(null);
                              }}
                              className="text-[11px] text-primary-600 hover:text-primary-800 underline font-semibold"
                            >
                              Change NetID
                            </button>
                          </div>

                          <div className="p-2.5 bg-amber-500/10 border border-amber-300 rounded-lg text-amber-950 text-[11px] flex items-start space-x-2">
                            <Mail className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <p className="font-bold">6-Digit Code Sent via EmailJS</p>
                              <p className="text-amber-900">
                                Check your Texas State Outlook inbox (<a href="https://outlook.office.com" target="_blank" rel="noreferrer" className="underline font-bold text-primary-700">outlook.office.com</a>) and enter the 6-digit code below.
                              </p>
                            </div>
                          </div>

                          <form onSubmit={handleModalVerifyCode} className="space-y-3 pt-1">
                            <div>
                              <label className="block text-[11px] font-bold text-gray-700 mb-1">
                                Enter 6-Digit Code *
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                autoFocus
                                required
                                placeholder="••••••"
                                value={modalCode}
                                onChange={(e) => setModalCode(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-full text-center text-xl tracking-[0.3em] font-mono font-black py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:bg-white focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-gray-900"
                              />
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={modalIsVerifying || modalCode.trim().length !== 6}
                                className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                              >
                                {modalIsVerifying ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                <span>{modalIsVerifying ? 'Verifying...' : 'Verify Code'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleModalResend}
                                disabled={modalIsSubmitting}
                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-medium transition-colors disabled:opacity-60 flex items-center space-x-1"
                              >
                                <RefreshCw className={`w-3 h-3 ${modalIsSubmitting ? 'animate-spin' : ''}`} />
                                <span>Resend</span>
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <form onSubmit={handleModalSubmitNetId} className="space-y-2.5">
                          <div>
                            <div className="flex items-center justify-between mb-1 text-[11px]">
                              <label className="font-bold text-gray-700">
                                Texas State NetID *
                              </label>
                            </div>
                            <input
                              type="text"
                              required
                              placeholder="e.g. abc12"
                              value={modalNetId}
                              onChange={(e) => setModalNetId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                              className="w-full text-xs font-mono uppercase px-3 py-2 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-bold"
                            />
                            <div className="mt-1 text-[11px] text-gray-500 flex items-center justify-between">
                              <span>Constructed Email:</span>
                              <span className="font-mono font-bold text-primary-700">
                                {(modalNetId || '_____')}@txstate.edu
                              </span>
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={modalIsSubmitting || !modalNetId.trim()}
                            className="w-full flex items-center justify-center space-x-1.5 py-2.5 px-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{modalIsSubmitting ? 'Sending Code...' : 'Send 6-Digit Verification Code'}</span>
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* View Full Profile Dashboard Button */}
              <Link
                to="/profile"
                onClick={onClose}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all hover:shadow"
              >
                <UserIcon className="w-4 h-4" />
                <span>Go to My Profile & Member Benefits</span>
              </Link>

              {/* Action Buttons for Officers */}
              {isOfficer && (
                <div className="space-y-3 pt-1">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Officer Controls
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {onOpenCommitteesModal && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenCommitteesModal();
                        }}
                        className="flex items-center justify-center space-x-2 p-3 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl font-medium text-sm transition-colors border border-primary-200"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>Manage Committees</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowMemberManager(!showMemberManager)}
                      className="flex items-center justify-center space-x-2 p-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-medium text-sm transition-colors border border-gray-200"
                    >
                      <Users className="w-4 h-4" />
                      <span>{showMemberManager ? 'Hide Roster' : 'Member Roster'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Officer Member Roster / Classification Panel */}
              {isOfficer && showMemberManager && (
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <h5 className="text-sm font-bold text-gray-900">Manage Account Roles</h5>
                    <span className="text-xs text-gray-500">{allUsers.length} Users</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {allUsers.map((u) => (
                      <div
                        key={u.uid}
                        className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-gray-200 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold text-gray-900 truncate">{u.displayName}</p>
                          <p className="text-gray-500 truncate">{u.email}</p>
                        </div>
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.uid, e.target.value as UserRole)}
                          className="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg p-1.5 focus:ring-primary-500 focus:border-primary-500 text-xs"
                        >
                          <option value="non_member">Non-Member</option>
                          <option value="member">Member</option>
                          <option value="officer">Officer</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sign Out Button */}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center space-x-2 text-gray-600 hover:text-red-600 hover:bg-red-50 py-3 rounded-xl transition-colors font-medium text-sm border border-gray-200"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
