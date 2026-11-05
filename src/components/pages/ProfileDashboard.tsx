import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Shield, 
  CheckCircle2, 
  AlertCircle, 
  Utensils, 
  Plane, 
  Users, 
  Briefcase, 
  Lock, 
  ExternalLink, 
  Save, 
  Search, 
  Filter, 
  Check, 
  XCircle, 
  Sparkles,
  Mail,
  Send,
  RefreshCw,
  GraduationCap,
  QrCode,
  Award,
  Trash2,
  Camera,
  AlertTriangle,
  CreditCard,
  Eye,
  EyeOff,
  Clock,
  Upload
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { collection, onSnapshot, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth, UserProfile } from '../../context/useAuth';

export const ProfileDashboard: React.FC = () => {
  const { 
    user, 
    userProfile, 
    isAdmin, 
    isOfficer,
    isPaidMember, 
    isDuePaying,
    meritPoints,
    isTxStateEmail,
    signInWithGoogle, 
    signOut, 
    deleteAccount,
    updateProfileInfo,
    verifyUserMembership,
    updateUserRole,
    adminUpdateUserPoints,
    adminVerifyNetId,
    sendNetIdVerificationCode,
    verifyNetIdCode,
    setLeaderboardPrivacy
  } = useAuth();

  // Profile Form State
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isShpetinasMember, setIsShpetinasMember] = useState(false);
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);
  const [pointsDraft, setPointsDraft] = useState<Record<string, number>>({});
  const [major, setMajor] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [studentId, setStudentId] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Google Sign In State
  const [signInError, setSignInError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleDashboardSignIn = async () => {
    setSignInError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const errObj = err as { code?: string; message?: string };
      if (errObj.code !== 'auth/popup-closed-by-user') {
        if (errObj.code === 'auth/unauthorized-domain') {
          setSignInError('This domain is not authorized in Firebase Authentication. Please check Firebase Auth settings.');
        } else {
          setSignInError(errObj.message || 'Google sign-in failed. Please try again.');
        }
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Texas State 6-Digit Email Verification Gate State
  const [netIdInput, setNetIdInput] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [verificationStep, setVerificationStep] = useState<'send_code' | 'enter_code'>('send_code');
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [netIdFeedback, setNetIdFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Account Deletion State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Admin Roster State
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'paid' | 'unpaid' | 'officer'>('all');
  const [adminActionStatus, setAdminActionStatus] = useState<string | null>(null);

  // Leaderboard Privacy Instant Toggle State
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [privacyToast, setPrivacyToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Explicitly read showOnLeaderboard from user's Firestore document on initialization
  // Defaults to true ONLY if showOnLeaderboard is undefined. If explicitly false, initializes OFF.
  useEffect(() => {
    if (!user) return;
    let isCancelled = false;
    const loadSavedPrivacyPreference = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && !isCancelled) {
          const data = userSnap.data();
          if (data.showOnLeaderboard === false) {
            setShowOnLeaderboard(false);
          } else if (data.showOnLeaderboard === true) {
            setShowOnLeaderboard(true);
          } else {
            setShowOnLeaderboard(true);
          }
        }
      } catch (err) {
        console.warn('Error reading saved showOnLeaderboard from Firestore:', err);
      }
    };
    loadSavedPrivacyPreference();
    return () => {
      isCancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.fullName || userProfile.displayName || '');
      setDisplayName(userProfile.displayName || userProfile.fullName || '');
      setIsShpetinasMember(Boolean(userProfile.isShpetinasMember));
      if (userProfile.showOnLeaderboard === false) {
        setShowOnLeaderboard(false);
      } else if (userProfile.showOnLeaderboard === true) {
        setShowOnLeaderboard(true);
      } else {
        setShowOnLeaderboard(true);
      }
      setMajor(userProfile.major || 'Electrical Engineering');
      setGradYear(userProfile.gradYear || '2027');
      setStudentId(userProfile.netid || userProfile.studentId || '');

      // Sync NetID input
      if (userProfile.netid) {
        setNetIdInput(userProfile.netid);
      } else if (userProfile.txstateEmail) {
        setNetIdInput(userProfile.txstateEmail.split('@')[0]);
      } else if (user?.email?.toLowerCase().endsWith('@txstate.edu')) {
        setNetIdInput(user.email.toLowerCase().split('@')[0]);
      }

      // If user has an active code pending verification, default directly to enter_code step
      const rawExpiry = userProfile.netIdVerification?.expiresAt || userProfile.codeExpiresAt;
      if (rawExpiry && !userProfile.isNetIDVerified) {
        setCodeExpiresAt(rawExpiry);
        setVerificationStep('enter_code');
      }
    } else if (user?.email?.toLowerCase().endsWith('@txstate.edu')) {
      setNetIdInput(user.email.toLowerCase().split('@')[0]);
    }
  }, [userProfile, user]);

  // 10-Minute Dynamic Countdown Timer for 6-Digit Verification Code
  useEffect(() => {
    const rawExpiry = codeExpiresAt || userProfile?.netIdVerification?.expiresAt || userProfile?.codeExpiresAt;
    if (!rawExpiry || verificationStep !== 'enter_code' || isTxStateEmail) {
      setSecondsRemaining(null);
      return;
    }

    const targetMs = new Date(rawExpiry).getTime();
    const updateCountdown = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((targetMs - now) / 1000));
      setSecondsRemaining(diff);
      if (diff === 0) {
        setNetIdFeedback((prev) => 
          prev?.type === 'error' && prev.text.includes('expired')
            ? prev
            : {
                type: 'error',
                text: 'Your verification code has expired (10-minute limit). Please click "Resend Code" to generate a new code.',
              }
        );
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [codeExpiresAt, userProfile, verificationStep, isTxStateEmail]);

  const formatCountdown = (seconds: number | null) => {
    if (seconds === null) return '10:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Immediately executes update to user document in Firestore on toggle, awaits confirmation, and shows confirmation toast
  const handleToggleLeaderboardPrivacy = async (newValue: boolean) => {
    if (!user) return;
    const prevValue = showOnLeaderboard;
    setShowOnLeaderboard(newValue);
    setIsUpdatingPrivacy(true);
    setPrivacyToast(null);

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        showOnLeaderboard: newValue,
        updatedAt: serverTimestamp(),
      });
      if (setLeaderboardPrivacy) {
        await setLeaderboardPrivacy(newValue);
      } else {
        await updateProfileInfo({ showOnLeaderboard: newValue });
      }
      setPrivacyToast({
        type: 'success',
        text: newValue
          ? 'Privacy updated: Your profile is now visible on chapter Merit Boards!'
          : 'Privacy updated: You have opted out and are removed from all public leaderboards.'
      });
      setTimeout(() => setPrivacyToast(null), 4000);
    } catch (err: unknown) {
      setShowOnLeaderboard(prevValue);
      setPrivacyToast({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update privacy preference in Firestore.'
      });
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  // Admin real-time listener for all user profiles
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => {
        users.push(doc.data() as UserProfile);
      });
      setAllUsers(users);
    });
    return () => unsub();
  }, [isAdmin]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const chosenName = fullName.trim() || displayName.trim();
      await updateProfileInfo({
        fullName: chosenName,
        displayName: chosenName,
        isShpetinasMember,
        showOnLeaderboard,
        major: major.trim(),
        gradYear: gradYear.trim(),
        studentId: studentId.trim(),
      });
      setProfileMessage({ type: 'success', text: 'Profile information updated successfully!' });
      setTimeout(() => setProfileMessage(null), 3500);
    } catch (err: unknown) {
      setProfileMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to update profile.' 
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSendVerificationCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = netIdInput.trim().toLowerCase();
    if (!clean) {
      setNetIdFeedback({
        type: 'error',
        text: 'Please enter your Texas State NetID (e.g. abc12) or university email.',
      });
      return;
    }

    // 1. Clear any previous error messages before starting send process
    setNetIdFeedback(null);
    setIsSendingCode(true);

    try {
      const res = await sendNetIdVerificationCode(clean);
      // 2. Immediately update local React component state right after code generation
      setVerificationStep('enter_code');
      if (res.expiresAt) {
        setCodeExpiresAt(res.expiresAt);
      }
      setEnteredCode('');
      setNetIdFeedback({ 
        type: res.delivered ? 'success' : res.deliveryError ? 'error' : 'success', 
        text: res.message || `Verification code sent to ${res.email}! Please check your Texas State Outlook inbox.` 
      });
    } catch (err: unknown) {
      console.warn('sendNetIdVerificationCode warning:', err);
      setVerificationStep('enter_code');
      setEnteredCode('');
      setNetIdFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : `Failed to send verification code. Please try again.`,
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyNetIdCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = enteredCode.trim().replace(/[^0-9]/g, '');
    if (cleanCode.length !== 6) {
      setNetIdFeedback({
        type: 'error',
        text: 'Please enter the complete 6-digit numeric verification code.',
      });
      return;
    }

    setIsVerifyingCode(true);
    setNetIdFeedback(null);
    try {
      await verifyNetIdCode(cleanCode);
      setSuccessToast('NetID Verified!');
      setNetIdFeedback({
        type: 'success',
        text: 'NetID Verified! Your account has been authenticated.',
      });
      setTimeout(() => {
        setSuccessToast(null);
      }, 5000);
    } catch (err: unknown) {
      // Inline error message without crashing the page or logging the user out
      setNetIdFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Invalid or expired code',
      });
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleResendVerificationCode = async () => {
    const targetNetId = userProfile?.txstateEmail || userProfile?.netid || netIdInput;
    if (!targetNetId) {
      setVerificationStep('send_code');
      return;
    }

    // Clear previous errors before resending
    setNetIdFeedback(null);
    setIsSendingCode(true);
    try {
      const res = await sendNetIdVerificationCode(targetNetId);
      // Immediately stay on / ensure enter_code step
      setVerificationStep('enter_code');
      if (res.expiresAt) {
        setCodeExpiresAt(res.expiresAt);
      }
      setEnteredCode('');
      setNetIdFeedback({
        type: res.delivered ? 'success' : res.deliveryError ? 'error' : 'success',
        text: res.message || `New 6-digit verification code sent to ${res.email}! Please check your Texas State Outlook inbox.`,
      });
    } catch (err: unknown) {
      console.warn('handleResendVerificationCode notice:', err);
      setVerificationStep('enter_code');
      setNetIdFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to resend verification code. Please try again.',
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    setIsDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      // Redirect to home page
      window.location.href = '/';
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account.');
      setIsDeletingAccount(false);
    }
  };

  const handleAdminModifyPoints = async (targetUid: string, targetPoints: number) => {
    const cleanPoints = Math.max(0, Number(targetPoints) || 0);
    // Instant UI state update
    setAllUsers((prev) => prev.map((u) => u.uid === targetUid ? { ...u, meritPoints: cleanPoints } : u));
    setPointsDraft((prev) => ({ ...prev, [targetUid]: cleanPoints }));
    setAdminActionStatus(`Updated member points to ${cleanPoints} pts.`);

    try {
      if (adminUpdateUserPoints) {
        await adminUpdateUserPoints(targetUid, cleanPoints);
      } else {
        const userRef = doc(db, 'users', targetUid);
        await updateDoc(userRef, {
          meritPoints: cleanPoints,
          updatedAt: serverTimestamp(),
        });
      }
      setTimeout(() => setAdminActionStatus(null), 3000);
    } catch (err) {
      console.error('Failed to update user points:', err);
      setAdminActionStatus('Error updating member points.');
    }
  };

  const handleAdminVerifyNetIdOverride = async (targetUid: string, shouldVerify = true) => {
    // 1. INSTANT OPTIMISTIC UI STATE UPDATE
    setAllUsers((prev) => prev.map((u) => u.uid === targetUid ? { 
      ...u, 
      isNetIDVerified: shouldVerify,
      txstateVerified: shouldVerify,
      isVerified: shouldVerify,
      emailVerified: shouldVerify,
    } : u));
    setAdminActionStatus(shouldVerify ? 'NetID verified!' : 'NetID verification revoked.');

    try {
      // 2. Direct update to user Firestore document as required
      const userRef = doc(db, 'users', targetUid);
      await updateDoc(userRef, {
        isNetIDVerified: shouldVerify,
        txstateVerified: shouldVerify,
        isVerified: shouldVerify,
        emailVerified: shouldVerify,
        netidVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Synchronize with auth context helper if available
      if (adminVerifyNetId) {
        await adminVerifyNetId(targetUid, shouldVerify);
      }
      setTimeout(() => setAdminActionStatus(null), 3000);
    } catch (err) {
      console.error('Failed to override NetID verification:', err);
      // Rollback on error
      setAllUsers((prev) => prev.map((u) => u.uid === targetUid ? { 
        ...u, 
        isNetIDVerified: !shouldVerify,
        txstateVerified: !shouldVerify,
        isVerified: !shouldVerify,
        emailVerified: !shouldVerify,
      } : u));
      setAdminActionStatus('Error verifying NetID. Please try again.');
    }
  };

  const handleAdminVerify = async (uid: string, newPaidStatus: boolean) => {
    try {
      await verifyUserMembership(uid, newPaidStatus, '2026-2027');
      setAdminActionStatus(`User status updated to ${newPaidStatus ? 'Paid Member' : 'Non-Member'}.`);
      setTimeout(() => setAdminActionStatus(null), 3000);
    } catch (err) {
      console.error('Failed to update membership:', err);
      setAdminActionStatus('Error updating membership status.');
    }
  };

  const handleAdminRole = async (uid: string, role: 'officer' | 'member' | 'non_member') => {
    try {
      await updateUserRole(uid, role);
      setAdminActionStatus(`Role updated to ${role}.`);
      setTimeout(() => setAdminActionStatus(null), 3000);
    } catch (err) {
      console.error('Failed to change role:', err);
    }
  };

  // Filtered users for admin view
  const filteredUsers = allUsers.filter((u) => {
    const matchesSearch = 
      (u.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) || false) || (u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (u.studentId?.toLowerCase().includes(searchQuery.toLowerCase()) || false);

    if (!matchesSearch) return false;
    if (filterRole === 'paid') return u.isPaidMember === true;
    if (filterRole === 'unpaid') return !u.isPaidMember;
    if (filterRole === 'officer') return u.role === 'officer';
    return true;
  });

  // Step 1: Unauthenticated View
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 pt-28 pb-20 px-4">
        <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl border border-gray-100 p-8 md:p-12 text-center space-y-6">
          <div className="w-20 h-20 bg-primary-50 text-primary-600 rounded-3xl mx-auto flex items-center justify-center">
            <Lock className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Member Sign In
            </h1>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
              Sign in with your Google Account, then enter your Texas State NetID to verify your student email.
            </p>
          </div>

          <div className="p-4 bg-primary-50 rounded-2xl border border-primary-200 text-left text-xs text-primary-900 space-y-1.5">
            <div className="font-bold flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-primary-600" />
              <span>Texas State NetID Student Verification</span>
            </div>
            <p className="text-gray-600">
              You can log in initially with your Google account. Right after login, enter your NetID to receive a secure 6-digit verification code sent to your official <code className="bg-white px-1 py-0.5 rounded text-primary-700 font-bold font-mono">@txstate.edu</code> inbox.
            </p>
          </div>

          {signInError && (
            <div className="bg-red-50 text-red-700 text-xs p-3.5 rounded-2xl border border-red-200 flex items-start space-x-2 text-left">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
              <span>{signInError}</span>
            </div>
          )}

          <button
            onClick={handleDashboardSignIn}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center space-x-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-bold py-3.5 px-6 rounded-2xl shadow-md transition-all hover:shadow-lg"
          >
            {isSigningIn ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In with Google Account</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Step 7: Check to block access to the main dashboard until user.emailVerified is confirmed true.
  const isDashboardUnlocked = isTxStateEmail;

  if (!isDashboardUnlocked) {
    return (
      <div className="min-h-screen bg-gray-50 pt-28 pb-20 px-4">
        {successToast && (
          <div className="fixed top-24 right-6 z-50 bg-emerald-600 text-white font-bold px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 border border-emerald-400 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-100 flex-shrink-0" />
            <span className="text-sm">{successToast}</span>
          </div>
        )}
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Top User Status Bar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3 min-w-0">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-10 h-10 rounded-full border border-primary-500 object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">
                  {userProfile?.fullName || userProfile?.displayName || user.displayName || 'Texas State Student'}
                </p>
                <p className="text-xs text-gray-500 font-mono truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="text-xs font-semibold px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors"
            >
              Sign Out
            </button>
          </div>

          {/* Verification Gate Card */}
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in">
            {/* Header banner */}
            <div className="bg-primary-600 px-6 py-6 text-white text-center space-y-2">
              <div className="w-14 h-14 bg-white/10 rounded-2xl mx-auto flex items-center justify-center mb-1">
                <GraduationCap className="w-8 h-8 text-accent-300" />
              </div>
              <h2 className="text-2xl font-black">Texas State Student Verification</h2>
              <p className="text-xs text-primary-100 max-w-md mx-auto">
                Access to the personalized SHPE member dashboard requires verifying your Texas State NetID email.
              </p>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              {netIdFeedback && (
                <div className={`p-4 rounded-2xl text-xs flex items-start space-x-3 ${
                  netIdFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-red-50 text-red-900 border border-red-200'
                }`}>
                  {netIdFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">{netIdFeedback.type === 'success' ? 'Status' : 'Notice'}</p>
                    <p className="text-xs leading-relaxed">{netIdFeedback.text}</p>
                  </div>
                </div>
              )}

              {/* Verification Gate: Step-by-Step 6-Digit Email Code Verification Flow */}
              {verificationStep === 'enter_code' ? (
                /* Step 2: 6-Digit Code Entry */
                <form onSubmit={handleVerifyNetIdCode} className="space-y-6">
                  <div className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 space-y-4">
                    <div className="flex items-center space-x-2.5 text-amber-950 font-bold text-sm">
                      <div className="p-1.5 bg-amber-600 text-white rounded-lg shadow-xs">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-base text-gray-900">Check Your Texas State Inbox</h4>
                        <p className="text-xs text-amber-800 font-normal">A 6-digit verification code was sent to your university email</p>
                      </div>
                    </div>

                    <div className="p-4 bg-white rounded-xl border border-amber-300 font-mono text-sm text-primary-900 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                        <span>{userProfile?.txstateEmail || (userProfile?.netid ? `${userProfile.netid}@txstate.edu` : (netIdInput.includes('@') ? netIdInput : `${netIdInput}@txstate.edu`))}</span>
                      </div>
                      <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold shadow-xs ${
                        secondsRemaining === 0 
                          ? 'bg-red-100 text-red-800 border border-red-300' 
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}>
                        <Clock className={`w-3.5 h-3.5 ${secondsRemaining === 0 ? 'text-red-600' : 'text-amber-700 animate-pulse'}`} />
                        <span>
                          {secondsRemaining === 0 ? 'Expired (00:00)' : `Expires in ${formatCountdown(secondsRemaining)}`}
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-amber-500/10 border border-amber-300 rounded-xl text-xs text-amber-950 flex items-start space-x-2.5">
                      <Mail className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-bold">6-Digit Code Dispatched via EmailJS</p>
                        <p className="text-[11px] text-amber-900 leading-relaxed">
                          Your verification code was sent to your Texas State Outlook email. Please open <a href="https://outlook.office.com" target="_blank" rel="noreferrer" className="underline font-bold text-primary-700">outlook.office.com</a> and enter the 6-digit code below to authenticate your Bobcat account.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <label htmlFor="verification-code-input" className="block text-xs font-extrabold text-gray-800">
                        Enter 6-Digit Verification Code *
                      </label>
                      <input
                        id="verification-code-input"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        autoFocus
                        autoComplete="one-time-code"
                        required
                        placeholder="••••••"
                        value={enteredCode}
                        onChange={(e) => setEnteredCode(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full text-center text-3xl tracking-[0.4em] font-mono font-black py-4 bg-white border-2 border-amber-400 rounded-2xl focus:border-primary-600 focus:ring-4 focus:ring-primary-100 text-gray-900 shadow-inner"
                      />
                      <p className="text-[11px] text-gray-500 text-center">
                        Code valid for 10 minutes. Check your Texas State Outlook Junk or Spam folder if not found in Inbox.
                      </p>
                    </div>

                    {secondsRemaining === 0 && (
                      <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center space-x-2.5">
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <span>This 6-digit code has expired. Please click <strong>"Resend Code"</strong> to receive a new one.</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={isVerifyingCode || enteredCode.trim().length !== 6 || secondsRemaining === 0}
                        className="flex-1 flex items-center justify-center space-x-2 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isVerifyingCode ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>{isVerifyingCode ? 'Verifying Code...' : 'Submit & Verify NetID'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleResendVerificationCode}
                        disabled={isSendingCode}
                        className="flex items-center justify-center space-x-2 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-xs rounded-xl transition-colors disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSendingCode ? 'animate-spin' : ''}`} />
                        <span>{isSendingCode ? 'Sending...' : 'Resend Code'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setVerificationStep('send_code');
                          setNetIdFeedback(null);
                        }}
                        className="py-3 px-4 text-gray-500 hover:text-gray-800 text-xs font-semibold underline transition-colors"
                      >
                        Change NetID
                      </button>
                    </div>
                  </div>

                  {/* Texas State Outlook Tips */}
                  <div className="p-4 bg-primary-50/70 rounded-2xl border border-primary-200/80 space-y-2 text-xs text-primary-950">
                    <div className="flex items-center space-x-2 font-bold">
                      <GraduationCap className="w-4 h-4 text-primary-700 flex-shrink-0" />
                      <span>Texas State Microsoft 365 Outlook Instructions</span>
                    </div>
                    <p className="text-[11px] text-gray-700 leading-relaxed">
                      Log into your official university email (<a href="https://outlook.office.com" target="_blank" rel="noreferrer" className="text-primary-700 underline font-bold">outlook.office.com</a>). Look for the email with subject <strong>"Your Texas State NetID Verification Code"</strong> containing your 6-digit code.
                    </p>
                  </div>
                </form>
              ) : (
                /* Step 1: Request 6-Digit Code Flow */
                <form onSubmit={handleSendVerificationCode} className="space-y-5">
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-gray-800">
                      Enter Your Texas State NetID or Email *
                    </label>
                    <p className="text-xs text-gray-500">
                      Please enter your university NetID (e.g. <strong className="font-mono text-primary-700">abc12</strong>) or full address (<strong className="font-mono text-primary-700">abc12@txstate.edu</strong>).
                    </p>

                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="abc12 or abc12@txstate.edu"
                        value={netIdInput}
                        onChange={(e) => setNetIdInput(e.target.value.toLowerCase().replace(/[^a-z0-9@.]/g, ''))}
                        className="w-full text-base font-mono px-4 py-3 bg-gray-50 border-2 border-gray-300 rounded-2xl focus:bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500 text-gray-900 font-bold"
                      />
                    </div>
                  </div>

                  {/* University Destination Email Preview */}
                  <div className="p-3.5 bg-primary-50 rounded-2xl border border-primary-200 flex items-center justify-between text-xs">
                    <span className="text-primary-900 font-medium">Verification Code Destination:</span>
                    <span className="font-mono font-bold text-primary-800 bg-white px-2.5 py-1 rounded-lg border border-primary-300">
                      {netIdInput ? (netIdInput.includes('@') ? netIdInput : `${netIdInput}@txstate.edu`) : 'yourNetID@txstate.edu'}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSendingCode || !netIdInput.trim()}
                      className="flex-1 flex items-center justify-center space-x-2 py-3.5 px-6 bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm rounded-xl shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSendingCode ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>{isSendingCode ? 'Sending 6-Digit Code...' : 'Send Verification Code'}</span>
                    </button>

                    {(userProfile?.netIdVerificationCode || userProfile?.codeExpiresAt) && (
                      <button
                        type="button"
                        onClick={() => {
                          setVerificationStep('enter_code');
                          setNetIdFeedback(null);
                        }}
                        className="px-4 py-3 text-xs font-semibold text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                      >
                        Already have a code?
                      </button>
                    )}
                  </div>
                </form>
              )}

              {/* Blocked Access Explanation */}
              <div className="pt-4 border-t border-gray-100 text-center">
                <p className="text-[11px] text-gray-500 flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                  <span>Access to chapter benefits, member passes, and committee dashboards is locked until email verification is confirmed.</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated & Verified Dashboard View
  return (
    <div className="min-h-screen bg-gray-50 pt-28 pb-24 px-4 sm:px-6">
      {successToast && (
        <div className="fixed top-24 right-6 z-50 bg-emerald-600 text-white font-bold px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 border border-emerald-400 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-100 flex-shrink-0" />
          <span className="text-sm">{successToast}</span>
        </div>
      )}
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Top Header Card */}
        <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-5">
            <div className="relative">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Profile'}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-primary-600 shadow-sm"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-primary-100 text-primary-700 font-black text-3xl flex items-center justify-center border-2 border-primary-600">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              {isPaidMember && (
                <span className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1 rounded-full shadow border-2 border-white" title="Verified Paid Member">
                  <Check className="w-3.5 h-3.5" />
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">
                  {user.displayName || 'Texas State Student'}
                </h1>
                {isAdmin ? (
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black border border-emerald-300">
                    Admin
                  </span>
                ) : userProfile?.role === 'officer' ? (
                  <span className="px-2.5 py-0.5 bg-primary-100 text-primary-800 rounded-full text-xs font-bold border border-primary-200">
                    Chapter Officer
                  </span>
                ) : null}
                {userProfile?.isShpetinasMember && (
                  <span className="px-2.5 py-0.5 bg-pink-100 text-pink-900 rounded-full text-xs font-bold border border-pink-300">
                    🌸 SHPEtinas Member
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 font-mono">
                {user.email}
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md font-semibold border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Texas State Verified ({userProfile?.txstateEmail || user.email})</span>
                </span>

                <span className="inline-flex items-center space-x-1 text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md font-semibold border border-blue-200">
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>NetID: {userProfile?.netid || userProfile?.studentId || (user.email?.split('@')[0])}</span>
                </span>

                {userProfile?.showOnLeaderboard === false ? (
                  <span className="inline-flex items-center space-x-1 text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md font-semibold border border-slate-300" title="Your profile is hidden from public merit boards">
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    <span>Merit Board: Hidden (Private)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md font-semibold border border-amber-300" title="Your profile and points appear on public merit boards">
                    <Eye className="w-3.5 h-3.5 text-amber-600" />
                    <span>Merit Board: Public</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => signOut()}
              className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Officer & Admin Tool Launch Banner */}
        {(isAdmin || isOfficer) && (
          <div className="bg-[#501214] text-white rounded-3xl p-6 shadow-md border-2 border-[#C4A47C] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="bg-[#C4A47C] text-[#501214] text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                  Admin Tool
                </span>
                <span className="text-xs font-bold text-gray-200">Event Attendance Management</span>
              </div>
              <h3 className="text-lg font-black text-white">
                Event Attendance &amp; Merit QR Code Scanner
              </h3>
              <p className="text-xs text-gray-200 max-w-xl">
                Scan members' profile QR codes at general meetings and workshops to automatically verify their due-paying status and award merit points in real-time.
              </p>
            </div>

            <Link
              to="/admin/scanner"
              className="w-full sm:w-auto px-6 py-3 bg-[#C4A47C] hover:bg-[#b39268] text-[#501214] font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 flex-shrink-0"
            >
              <Camera className="w-4 h-4" />
              <span>Launch Attendance Scanner &rarr;</span>
            </Link>
          </div>
        )}

        {/* ========================================================================= */}
        {/* USER QR CODE & MERIT POINTS SYSTEM CARD */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-3xl shadow-md border-2 border-gray-200 p-6 md:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-gray-200 pb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-[#501214] text-white rounded-2xl shadow-xs">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-[#1A1A1A]">
                  Digital Member Pass &amp; Merit Points
                </h2>
                <p className="text-xs text-gray-600 font-medium">
                  Present this customized QR code at chapter events for instant attendance check-in.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Link
                to="/programs/merits"
                className="text-xs font-black text-[#501214] hover:underline flex items-center space-x-1"
              >
                <span>View Merit Leaderboard</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            
            {/* Unique Personal QR Code Display (Every registered user receives one) */}
            <div className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 shadow-xs space-y-3 text-center transition-all ${
              isDuePaying 
                ? 'bg-white border-2 border-[#501214]' 
                : 'bg-white border-2 border-gray-400'
            }`}>
              <div className="p-3 bg-white rounded-2xl shadow-sm border-2 border-gray-200">
                <QRCodeSVG
                  value={JSON.stringify({
                    uid: user.uid,
                    netid: userProfile?.netid || userProfile?.studentId || (user.email?.split('@')[0]),
                    displayName: userProfile?.fullName || userProfile?.displayName || user.displayName || 'SHPE User',
                    fullName: userProfile?.fullName || userProfile?.displayName || user.displayName || 'SHPE User',
                    email: user.email || '',
                    isDuePaying: isDuePaying,
                    memberStatus: isDuePaying ? 'active_member' : 'guest_visitor',
                    type: 'shpe-txst-member-pass'
                  })}
                  size={165}
                  level="H"
                  fgColor={isDuePaying ? "#501214" : "#1A1A1A"} // Texas State Maroon for active members, Slate for visitors
                  bgColor="#ffffff"
                  includeMargin={true}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs font-black text-[#1A1A1A]">
                  {userProfile?.fullName || userProfile?.displayName || user.displayName || 'SHPE Bobcat'}
                </p>
                <p className="text-[11px] font-mono text-gray-600 font-bold">
                  NetID: {userProfile?.netid || userProfile?.studentId || (user.email?.split('@')[0])}
                </p>
                {isDuePaying ? (
                  <span className="inline-block px-3 py-1 bg-emerald-700 text-white text-[10px] font-black rounded-lg uppercase tracking-wider">
                    Active Member Pass (Points Active)
                  </span>
                ) : (
                  <div className="space-y-1">
                    <span className="inline-block px-3 py-1 bg-gray-200 text-[#1A1A1A] border border-gray-400 text-[10px] font-black rounded-lg uppercase tracking-wider">
                      Guest / Visitor Pass (0 Points)
                    </span>
                    <p className="text-[10px] text-amber-800 font-bold max-w-[200px] leading-tight">
                      Records attendance. Pay dues to unlock merit points!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Merit Points & Due-Paying Status (2 Cols) */}
            <div className="md:col-span-2 space-y-4">
              
              {/* Score Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 bg-white rounded-2xl border-2 border-[#501214] space-y-1 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#501214] uppercase tracking-wide">Current Merit Score</span>
                    <Award className="w-5 h-5 text-[#501214]" />
                  </div>
                  <div className="text-3xl font-black text-[#501214] font-mono">
                    {meritPoints} <span className="text-sm font-bold text-gray-600">pts</span>
                  </div>
                  <p className="text-[11px] text-gray-600 font-medium">
                    Earned from meetings, workshops &amp; volunteering
                  </p>
                </div>

                <div className="p-5 bg-white rounded-2xl border-2 border-emerald-700 space-y-1 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-800 uppercase tracking-wide">Events Attended</span>
                    <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div className="text-3xl font-black text-emerald-900 font-mono">
                    {userProfile?.attendanceCount || (userProfile?.attendanceHistory?.length || 0)}
                  </div>
                  <p className="text-[11px] text-gray-600 font-medium">
                    Verified through event QR check-ins
                  </p>
                </div>
              </div>

              {/* RESTRICTION ENFORCEMENT NOTICE */}
              {isDuePaying ? (
                <div className="p-4 bg-emerald-800 text-white rounded-2xl border-2 border-emerald-600 flex items-start space-x-3 shadow-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-200 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-xs">
                    <p className="font-black text-sm text-white">Active Due-Paying Member (Points Enabled)</p>
                    <p className="text-emerald-100 font-medium leading-relaxed">
                      Your chapter dues are confirmed! You are fully eligible for event merit points, leaderboard awards, and travel grants.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-500 space-y-2">
                  <div className="flex items-start space-x-2.5 text-[#1A1A1A]">
                    <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-black text-xs uppercase tracking-wide text-amber-900">
                        Points Accumulation Restriction
                      </h4>
                      <p className="text-xs text-[#1A1A1A] leading-relaxed mt-1 font-medium">
                        Notice: You are currently a <strong>Non-Due-Paying Member</strong>. By chapter constitution, <strong>only due-paying members are allowed to earn merit points</strong> at event check-ins.
                      </p>
                    </div>
                  </div>

                  <div className="pt-1 text-[11px] text-[#1A1A1A] font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span>
                      Chapter Dues: <strong>Semester: $30</strong> &bull; <strong>Full Year: $40</strong>. Pay with an officer or online.
                    </span>
                    <Link 
                      to="/membership" 
                      className="inline-flex items-center space-x-1 font-black underline text-[#501214] hover:text-black whitespace-nowrap"
                    >
                      <span>Pay Dues Form &rarr;</span>
                    </Link>
                  </div>
                </div>
              )}

              {/* Recent Event Attendance History */}
              {userProfile?.attendanceHistory && userProfile.attendanceHistory.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-gray-700">Recent Event Check-Ins</h4>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {userProfile.attendanceHistory.slice(0, 5).map((att, idx) => (
                      <div key={idx} className="p-2.5 bg-gray-50 rounded-xl text-xs flex items-center justify-between border border-gray-100">
                        <span className="font-semibold text-gray-800 truncate max-w-[200px]">
                          {att.eventName}
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            +{att.pointsAwarded} pts
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {new Date(att.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>

        {/* GRID: Membership Status & Benefits */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column (2 Cols): Membership Status & Benefits Hub */}
          <div className="lg:col-span-2 space-y-6">

            {/* MEMBERSHIP STATUS CARD */}
            <div className="bg-white rounded-3xl shadow-md border-2 border-gray-200 p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b-2 border-gray-200">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                    Academic Year 2026-2027
                  </span>
                  <h2 className="text-xl font-black text-[#1A1A1A]">
                    Official Chapter Membership Status
                  </h2>
                </div>

                {isPaidMember ? (
                  <span className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-700 text-white rounded-full text-xs font-black shadow-xs">
                    <Sparkles className="w-4 h-4 text-emerald-200" />
                    <span>Active Paid Member</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-gray-200 text-[#1A1A1A] rounded-full text-xs font-black border-2 border-gray-400">
                    <XCircle className="w-4 h-4 text-gray-600" />
                    <span>Non-Member / Unpaid</span>
                  </span>
                )}
              </div>

              {/* Status Specific Details */}
              {isPaidMember ? (
                /* VERIFIED PAID MEMBER CONTENT */
                <div className="space-y-6">
                  <div className="p-5 bg-white rounded-2xl border-2 border-emerald-700 flex items-start space-x-3.5 shadow-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-[#1A1A1A] space-y-1">
                      <p className="font-black text-sm text-emerald-800">You are an Active Paid Member!</p>
                      <p className="text-gray-700 font-medium leading-relaxed">
                        Your Texas State chapter dues are verified. You have full voting rights, member perks, and access to all chapter programs.
                      </p>
                      {userProfile?.membershipVerifiedBy && (
                        <p className="text-[11px] text-gray-500 font-bold">
                          Verified by {userProfile.membershipVerifiedBy}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Member Benefits List */}
                  <div>
                    <h3 className="text-xs font-black text-[#1A1A1A] mb-3 uppercase tracking-wider">
                      Your Active Member Benefits:
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="p-4 bg-white rounded-2xl border-2 border-gray-300 space-y-2">
                        <div className="w-9 h-9 rounded-xl bg-[#501214] text-white flex items-center justify-center">
                          <Utensils className="w-5 h-5" />
                        </div>
                        <h4 className="font-black text-[#1A1A1A] text-sm">Food &amp; Refreshments</h4>
                        <p className="text-xs text-gray-700 leading-relaxed font-medium">
                          Free food passes at all bi-weekly general meetings, workshops, and semester socials.
                        </p>
                      </div>

                      <div className="p-4 bg-white rounded-2xl border-2 border-gray-300 space-y-2">
                        <div className="w-9 h-9 rounded-xl bg-[#501214] text-white flex items-center justify-center">
                          <Plane className="w-5 h-5" />
                        </div>
                        <h4 className="font-black text-[#1A1A1A] text-sm">Convention Travel Grants</h4>
                        <p className="text-xs text-gray-700 leading-relaxed font-medium">
                          Funding opportunities for the SHPE National Convention and Regional Leadership Conference (RLDC).
                        </p>
                      </div>

                      <div className="p-4 bg-white rounded-2xl border-2 border-gray-300 space-y-2">
                        <div className="w-9 h-9 rounded-xl bg-[#501214] text-white flex items-center justify-center">
                          <Users className="w-5 h-5" />
                        </div>
                        <h4 className="font-black text-[#1A1A1A] text-sm">Committee Participation</h4>
                        <p className="text-xs text-gray-700 leading-relaxed font-medium">
                          Eligible to join, vote, and lead in Technology, SHPEtinas, Athletics, and Media committees.
                        </p>
                      </div>

                      <div className="p-4 bg-white rounded-2xl border-2 border-gray-300 space-y-2">
                        <div className="w-9 h-9 rounded-xl bg-[#501214] text-white flex items-center justify-center">
                          <Briefcase className="w-5 h-5" />
                        </div>
                        <h4 className="font-black text-[#1A1A1A] text-sm">Resume Book &amp; Sponsors</h4>
                        <p className="text-xs text-gray-700 leading-relaxed font-medium">
                          Direct distribution of your resume to sponsor companies including Dell, UFCU, and LCRA.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* NON-MEMBER / UNPAID VIEW */
                <div className="space-y-6">
                  <div className="p-5 bg-white rounded-2xl border-2 border-amber-500 space-y-3">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="font-black text-sm text-amber-900">
                          Chapter Dues Status
                        </h4>
                        <p className="text-xs text-[#1A1A1A] font-medium leading-relaxed">
                          Your Texas State university registration is verified. Chapter membership dues enable full participation in competition teams, conference travel grants, voting rights, and merit leaderboard ranking. Dues can be paid online via Google Form or in-person with chapter officers at any meeting.
                        </p>
                        <div className="pt-2 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center px-3 py-1 bg-white border-2 border-gray-400 rounded-lg text-xs font-black text-[#1A1A1A]">
                            Semester Dues: $30
                          </span>
                          <span className="inline-flex items-center px-3 py-1 bg-[#501214] text-white border-2 border-[#501214] rounded-lg text-xs font-black shadow-xs">
                            Full Year Dues: $40
                          </span>
                        </div>
                        <div className="pt-3 flex flex-wrap items-center gap-2">
                          <Link
                            to="/membership#dues-form"
                            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-[#501214] hover:bg-[#420f11] text-white rounded-xl text-xs font-black shadow-xs transition-colors"
                          >
                            <CreditCard className="w-3.5 h-3.5 text-[#C4A47C]" />
                            <span>Pay Dues Online (Google Form) &rarr;</span>
                          </Link>
                          <a
                            href="https://docs.google.com/forms/d/e/1FAIpQLSeRJ1KB662OmKDcHe-CJMfSr6LsUlEp0gGGW1hCI4UNO7EmbA/viewform?pli=1"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center space-x-1 px-3 py-2 bg-white hover:bg-gray-100 text-[#1A1A1A] border-2 border-gray-300 rounded-xl text-xs font-bold transition-colors"
                          >
                            <span>Open in New Tab</span>
                            <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Locked Benefits Preview */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-gray-700">
                      Benefits Available Upon Paid Membership:
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 bg-white rounded-xl border-2 border-gray-300 flex items-center space-x-3">
                        <Utensils className="w-4 h-4 text-[#501214]" />
                        <span className="text-xs text-[#1A1A1A] font-bold">Free Food at Chapter Meetings</span>
                      </div>
                      <div className="p-3.5 bg-white rounded-xl border-2 border-gray-300 flex items-center space-x-3">
                        <Plane className="w-4 h-4 text-[#501214]" />
                        <span className="text-xs text-[#1A1A1A] font-bold">National Convention Travel Grants</span>
                      </div>
                      <div className="p-3.5 bg-white rounded-xl border-2 border-gray-300 flex items-center space-x-3">
                        <Users className="w-4 h-4 text-[#501214]" />
                        <span className="text-xs text-[#1A1A1A] font-bold">Committee Roles &amp; Voting Rights</span>
                      </div>
                      <div className="p-3.5 bg-white rounded-xl border-2 border-gray-300 flex items-center space-x-3">
                        <Briefcase className="w-4 h-4 text-[#501214]" />
                        <span className="text-xs text-[#1A1A1A] font-bold">Corporate Sponsor Resume Drops</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Information Editor */}
            <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">
                  Student Profile Information
                </h3>
                <span className="text-xs text-gray-400">
                  Visible on your verified chapter account
                </span>
              </div>

              {profileMessage && (
                <div className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 ${
                  profileMessage.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {profileMessage.type === 'success' ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  <span>{profileMessage.text}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                {/* SHPEtinas Membership Prompt */}
                <div className="p-4 bg-gradient-to-r from-pink-50/90 via-purple-50/50 to-white rounded-2xl border-2 border-pink-200 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-pink-600 flex-shrink-0" />
                        <h4 className="text-sm font-extrabold text-gray-900">
                          Join SHPEtinas?
                        </h4>
                        <span className="text-[10px] font-bold bg-pink-100 text-pink-800 px-2 py-0.5 rounded-full border border-pink-300">
                          Specialized Program
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed font-medium">
                        Are you a member or would you like to be a member of SHPEtinas? Texas State SHPE's community dedicated to empowering Hispanic women in STEM through leadership, mentorship, and professional workshops (open to all allies and members). Joining includes your score on the dedicated <strong>SHPEtinas Leaderboard</strong>.
                      </p>
                    </div>
                    
                    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
                      <input
                        type="checkbox"
                        checked={isShpetinasMember}
                        onChange={(e) => setIsShpetinasMember(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                    </label>
                  </div>
                  <div className="text-[11px] font-bold text-pink-900 flex items-center space-x-1.5 pt-1">
                    <span>Selected Status:</span>
                    <strong className="underline">
                      {isShpetinasMember ? 'Yes, I am a member / would like to join SHPEtinas (Ranked on SHPEtinas Leaderboard)' : 'No, standard membership only'}
                    </strong>
                  </div>
                </div>

                {/* MERIT BOARD OPT-OUT PRIVACY SETTING */}
                <div className="p-4 bg-gradient-to-r from-amber-50/90 via-orange-50/40 to-white rounded-2xl border-2 border-amber-200 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        {showOnLeaderboard ? (
                          <Eye className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        )}
                        <h4 className="text-sm font-extrabold text-gray-900">
                          Display my profile on Merit Boards?
                        </h4>
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                          Privacy Setting
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed font-medium">
                        Control your visibility across the public chapter <strong>Merit Board</strong> and <strong>SHPEtinas Leaderboard</strong>. If you opt out, your earned merit points continue to be tracked accurately in your private dashboard, but your name, avatar, and rankings are strictly hidden from public leaderboards and Member of the Month spotlights.
                      </p>
                    </div>
                    
                    <label className={`relative inline-flex items-center ${isUpdatingPrivacy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} flex-shrink-0 mt-1`}>
                      <input
                        type="checkbox"
                        checked={showOnLeaderboard}
                        disabled={isUpdatingPrivacy}
                        onChange={(e) => handleToggleLeaderboardPrivacy(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>
                  <div className="text-[11px] font-bold text-amber-900 flex items-center space-x-1.5 pt-1">
                    <span>Privacy Status:</span>
                    <strong className="underline">
                      {showOnLeaderboard ? 'Public (Visible on Merit Board & Leaderboards)' : 'Private (Opted Out — Hidden from all public leaderboards)'}
                    </strong>
                  </div>

                  {privacyToast && (
                    <div className={`mt-2 p-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 animate-fade-in ${
                      privacyToast.type === 'success' 
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' 
                        : 'bg-red-100 text-red-900 border border-red-300'
                    }`}>
                      {privacyToast.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-700 flex-shrink-0" />
                      )}
                      <span>{privacyToast.text}</span>
                    </div>
                  )}

                  {isUpdatingPrivacy && !privacyToast && (
                    <div className="mt-2 text-[11px] font-bold text-amber-800 flex items-center space-x-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                      <span>Saving privacy preference to Firestore...</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-gray-800">Custom Student Full Name (First &amp; Last Name)</label>
                      <span className="text-[10px] font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded border border-primary-200">
                        Overrides Google
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maria Gonzalez"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        setDisplayName(e.target.value);
                      }}
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="mt-1 text-[11px] text-gray-500 font-medium leading-tight">
                      Custom name overrides your Google account name across all chapter leaderboards, passes, and check-in rosters.
                    </p>
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Texas State Email</label>
                    <input
                      type="email"
                      disabled
                      value={user.email || ''}
                      className="w-full p-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Major</label>
                    <input
                      type="text"
                      value={major}
                      onChange={(e) => setMajor(e.target.value)}
                      placeholder="e.g. Electrical Engineering"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Graduation Year</label>
                    <input
                      type="text"
                      value={gradYear}
                      onChange={(e) => setGradYear(e.target.value)}
                      placeholder="e.g. 2027"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">TXST NetID / Student ID</label>
                    <input
                      type="text"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="e.g. abc123"
                      className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:bg-white"
                    />
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between border-t border-gray-100">
                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                      <span>NetID Verified: {userProfile?.netid || userProfile?.studentId || (user.email?.split('@')[0])}</span>
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="inline-flex items-center space-x-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-sm transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingProfile ? 'Saving...' : 'Save Profile'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Danger Zone: Delete Account */}
            <div className="bg-white rounded-3xl shadow-sm border border-red-200 p-6 space-y-4">
              <div className="flex items-center space-x-2 text-red-700 font-bold text-sm">
                <Trash2 className="w-4 h-4 flex-shrink-0" />
                <span>Account Settings & Danger Zone</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Permanently delete your SHPE chapter profile.
              </p>

              {deleteError && (
                <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
                  <span>{deleteError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Account</span>
              </button>
            </div>
          </div>

          {/* Right Column (1 Col): Quick Links & Committee Access */}
          <div className="space-y-6">

            {/* Committee Access Card */}
            <div className="bg-white rounded-3xl shadow-md border border-gray-100 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <Users className="w-4 h-4 text-primary-600" />
                  <span>6 Official Committees</span>
                </h3>
                <Link to="/committees" className="text-[11px] text-primary-600 hover:text-primary-800 font-bold underline">
                  View All &rarr;
                </Link>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Explore our 6 official committees, connect with leaders, and see meeting times.
              </p>

              <div className="space-y-2 pt-1 text-xs">
                <Link
                  to="/committees?tab=athletics"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-primary-50 rounded-xl text-gray-700 hover:text-primary-800 transition-colors border border-gray-100"
                >
                  <span className="font-semibold">Athletics</span>
                  <span className="text-[11px] text-gray-400">View Tab &rarr;</span>
                </Link>
                <Link
                  to="/committees?tab=events"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-primary-50 rounded-xl text-gray-700 hover:text-primary-800 transition-colors border border-gray-100"
                >
                  <span className="font-semibold">Events & Logistics</span>
                  <span className="text-[11px] text-gray-400">View Tab &rarr;</span>
                </Link>
                <Link
                  to="/committees?tab=fundraising"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-primary-50 rounded-xl text-gray-700 hover:text-primary-800 transition-colors border border-gray-100"
                >
                  <span className="font-semibold">Fundraising & Sponsorship</span>
                  <span className="text-[11px] text-gray-400">View Tab &rarr;</span>
                </Link>
                <Link
                  to="/committees?tab=media"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-primary-50 rounded-xl text-gray-700 hover:text-primary-800 transition-colors border border-gray-100"
                >
                  <span className="font-semibold">Media & Marketing</span>
                  <span className="text-[11px] text-gray-400">View Tab &rarr;</span>
                </Link>
                <Link
                  to="/committees?tab=shpetinas"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-primary-50 rounded-xl text-gray-700 hover:text-primary-800 transition-colors border border-gray-100"
                >
                  <span className="font-semibold">SHPEtinas</span>
                  <span className="text-[11px] text-gray-400">View Tab &rarr;</span>
                </Link>
                <Link
                  to="/committees?tab=technology"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-primary-50 rounded-xl text-gray-700 hover:text-primary-800 transition-colors border border-gray-100"
                >
                  <span className="font-semibold">Technology</span>
                  <span className="text-[11px] text-gray-400">View Tab &rarr;</span>
                </Link>
                <Link
                  to="/committees"
                  className="block text-center py-2 bg-primary-50 text-primary-700 rounded-xl font-bold hover:bg-primary-100 transition-colors"
                >
                  Explore All 6 Committees &rarr;
                </Link>
              </div>
            </div>

            {/* Texas State Engineering Resources */}
            <div className="bg-primary-900 text-white rounded-3xl p-6 shadow-md space-y-3">
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-accent-400">
                Bobcat Engineering
              </span>
              <h4 className="text-lg font-black leading-snug">
                Ingram School of Engineering
              </h4>
              <p className="text-xs text-primary-200 leading-relaxed">
                Our general meetings take place every Wednesday at 6:30 PM in Ingram Hall 3202.
              </p>
              <div className="pt-2">
                <a
                  href="#events"
                  className="inline-block px-4 py-2 bg-white text-primary-900 font-bold text-xs rounded-xl hover:bg-accent-400 transition-colors"
                >
                  View Chapter Calendar
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ADMIN MANAGEMENT PANEL: ONLY ACCESSIBLE BY shpetxst@gmail.com */}
        {/* ========================================================================= */}
        {isAdmin && (
          <div className="bg-white rounded-3xl shadow-xl border-2 border-emerald-400 p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900">
                    Administrator Roster & Membership Verification
                  </h3>
                  <p className="text-xs text-gray-500">
                    Authorized exclusively for <strong className="font-mono text-emerald-800">shpetxst@gmail.com</strong>
                  </p>
                </div>
              </div>

              {adminActionStatus && (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-200 flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{adminActionStatus}</span>
                </div>
              )}
            </div>

            {/* Admin Quick Action Hub */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-primary-50 rounded-2xl border border-emerald-200">
              <Link
                to="/admin/analytics"
                className="flex items-center space-x-3 p-3 bg-white hover:bg-emerald-50 rounded-xl shadow-xs border border-emerald-200 transition-all hover:scale-[1.01]"
              >
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-gray-900">Time Logs & Analytics</div>
                  <div className="text-[10px] text-gray-500">Live attendance & CSV export</div>
                </div>
              </Link>

              <Link
                to="/admin/images"
                className="flex items-center space-x-3 p-3 bg-white hover:bg-primary-50 rounded-xl shadow-xs border border-primary-200 transition-all hover:scale-[1.01]"
              >
                <div className="p-2 bg-primary-100 text-primary-800 rounded-lg">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-gray-900">Image Management</div>
                  <div className="text-[10px] text-gray-500">Replace site & sponsor photos</div>
                </div>
              </Link>

              <Link
                to="/programs/mentorshpe?adminEdit=true"
                className="flex items-center space-x-3 p-3 bg-white hover:bg-amber-50 rounded-xl shadow-xs border border-amber-200 transition-all hover:scale-[1.01]"
              >
                <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-gray-900">MentorSHPE Manager</div>
                  <div className="text-[10px] text-gray-500">Edit guidelines & photo gallery</div>
                </div>
              </Link>

              <Link
                to="/admin/scanner"
                className="flex items-center space-x-3 p-3 bg-white hover:bg-blue-50 rounded-xl shadow-xs border border-blue-200 transition-all hover:scale-[1.01]"
              >
                <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-extrabold text-xs text-gray-900">QR Event Scanner</div>
                  <div className="text-[10px] text-gray-500">Fast attendee check-in & points</div>
                </div>
              </Link>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search registered members by name, email, or NetID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:bg-white"
                />
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as 'all' | 'paid' | 'unpaid' | 'officer')}
                  className="p-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium"
                >
                  <option value="all">All Members ({allUsers.length})</option>
                  <option value="paid">Paid Members Only</option>
                  <option value="unpaid">Unpaid Students Only</option>
                  <option value="officer">Officers Only</option>
                </select>
              </div>
            </div>

            {/* Members Table */}
            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Student Full Name</th>
                    <th className="px-4 py-3">Texas State Email</th>
                    <th className="px-4 py-3">NetID Verification</th>
                    <th className="px-4 py-3">Payment Status</th>
                    <th className="px-4 py-3">Merit Points (Admin Adjust)</th>
                    <th className="px-4 py-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => (
                      <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-extrabold text-gray-900">{u.fullName || u.displayName || 'No Name'}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-gray-600 font-bold uppercase">{u.role}</span>
                            {u.isShpetinasMember && (
                              <span className="text-[10px] bg-pink-100 text-pink-900 font-bold px-1.5 rounded border border-pink-200">
                                SHPEtinas
                              </span>
                            )}
                            {u.showOnLeaderboard === false && (
                              <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 rounded border border-slate-300" title="User opted out of public leaderboards">
                                Board: Hidden
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-gray-700 font-medium">
                          {u.email}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {u.isNetIDVerified || u.txstateVerified ? (
                            <div className="flex items-center space-x-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-700 mr-1" />
                                NetID Verified
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAdminVerifyNetIdOverride(u.uid, false)}
                                className="text-[10px] text-gray-500 hover:text-rose-600 underline font-semibold"
                                title="Revoke NetID verification"
                              >
                                Revoke
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAdminVerifyNetIdOverride(u.uid, true)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                              title="Single-click manual NetID verification override"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                              <span>Verify NetID</span>
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {u.isPaidMember ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                              Paid Member
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-300">
                              Unpaid / Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              title="Subtract 1 point"
                              onClick={() => handleAdminModifyPoints(u.uid, Math.max(0, (u.meritPoints || 0) - 1))}
                              className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-900 rounded font-black text-xs border border-gray-300 transition-colors"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={0}
                              value={pointsDraft[u.uid] !== undefined ? pointsDraft[u.uid] : (u.meritPoints || 0)}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setPointsDraft((prev) => ({ ...prev, [u.uid]: isNaN(val) ? 0 : val }));
                              }}
                              className="w-16 px-1.5 py-1 text-xs font-mono font-bold text-center border border-gray-300 rounded bg-white text-gray-900"
                            />
                            <button
                              type="button"
                              title="Add 1 point"
                              onClick={() => handleAdminModifyPoints(u.uid, (u.meritPoints || 0) + 1)}
                              className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-900 rounded font-black text-xs border border-gray-300 transition-colors"
                            >
                              +
                            </button>
                            {pointsDraft[u.uid] !== undefined && pointsDraft[u.uid] !== (u.meritPoints || 0) && (
                              <button
                                type="button"
                                onClick={() => handleAdminModifyPoints(u.uid, pointsDraft[u.uid])}
                                className="px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded text-[10px] font-bold shadow-xs transition-colors"
                              >
                                Set
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                          <button
                            onClick={() => handleAdminVerify(u.uid, !u.isPaidMember)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                              u.isPaidMember
                                ? 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                            }`}
                          >
                            {u.isPaidMember ? 'Revoke Paid' : 'Verify Paid'}
                          </button>

                          {u.role !== 'officer' ? (
                            <button
                              onClick={() => handleAdminRole(u.uid, 'officer')}
                              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold border border-gray-200"
                            >
                              Make Officer
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAdminRole(u.uid, 'member')}
                              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold border border-gray-200"
                            >
                              Demote
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                        No registered users found matching the query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DELETE ACCOUNT CONFIRMATION MODAL */}
        {/* ========================================================================= */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-red-100 space-y-5 animate-scale-up">
              <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl mx-auto flex items-center justify-center">
                <AlertTriangle className="w-7 h-7" />
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-xl font-extrabold text-gray-900">Permanently Delete Account?</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Are you absolutely sure you want to delete your chapter account? This securely calls Firebase's deleteUser function and removes your profile, attendance records, and merit points from Firestore. This action cannot be reversed.
                </p>
              </div>

              {deleteError && (
                <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200">
                  {deleteError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeletingAccount}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAccount}
                  disabled={isDeletingAccount}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingAccount ? 'Deleting...' : 'Yes, Delete Account'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ProfileDashboard;
