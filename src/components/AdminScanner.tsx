import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  Sparkles, 
  Award, 
  Calendar, 
  RefreshCw, 
  UserCheck, 
  ArrowLeft,
  DollarSign,
  Upload,
  Video,
  VideoOff,
  FlipHorizontal
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { useAuth, UserProfile } from '../context/useAuth';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_MERIT_CATEGORIES, MeritCategory } from '../services/meritConfigService';
import { recordAttendanceLog } from '../services/attendanceService';

interface ScannedMemberResult {
  status: 'success' | 'blocked' | 'error';
  member?: UserProfile;
  message: string;
  pointsAdded?: number;
  newTotal?: number;
  timestamp: string;
}

const FALLBACK_EVENTS: { name: string; points: number }[] = DEFAULT_MERIT_CATEGORIES.map((c) => ({
  name: c.name,
  points: c.points,
}));

export const AdminScanner: React.FC = () => {
  const { user, isAdmin, updateDuePayingStatus } = useAuth();
  const [eventCategories, setEventCategories] = useState<{ name: string; points: number }[]>(FALLBACK_EVENTS);
  const [selectedEvent, setSelectedEvent] = useState(FALLBACK_EVENTS[0].name);
  const [pointValue, setPointValue] = useState<number>(FALLBACK_EVENTS[0].points);
  const [customEventName, setCustomEventName] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScannedResult, setLastScannedResult] = useState<ScannedMemberResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScannedMemberResult[]>([]);
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'running' | 'error' | 'stopped'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [quickPayMember, setQuickPayMember] = useState<UserProfile | null>(null);

  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isProcessingRef = useRef(false);

  // Subscribe to live dynamic merit point categories configured by admin
  useEffect(() => {
    const meritConfigRef = doc(db, 'settings', 'meritConfig');
    const unsub = onSnapshot(
      meritConfigRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.categories) && data.categories.length > 0) {
            const mapped = data.categories.map((c: MeritCategory) => ({
              name: c.name,
              points: Number(c.points),
            }));
            setEventCategories(mapped);
            const currentMatch = mapped.find((c: { name: string; points: number }) => c.name === selectedEvent);
            if (currentMatch) {
              setPointValue(currentMatch.points);
            }
          }
        }
      },
      (err) => console.warn('Merit config listener in scanner notice:', err)
    );
    return () => unsub();
  }, [selectedEvent]);

  // Synthesized success audio chime
  const playSound = (isSuccess: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isSuccess) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(164.81, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {
      // AudioContext unavailable
    }
  };

  const handleProcessScan = useCallback(async (rawText: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      let targetUid = '';
      let targetNetId = '';

      // Check if QR code is JSON format
      if (rawText.startsWith('{') && rawText.endsWith('}')) {
        try {
          const parsed = JSON.parse(rawText);
          targetUid = parsed.uid || '';
          targetNetId = parsed.netid || '';
        } catch {
          targetUid = rawText.trim();
        }
      } else {
        targetUid = rawText.trim();
      }

      // If input looks like NetID or targetNetId is provided, query user by NetID
      let resolvedMember: UserProfile | null = null;
      const netIdToSearch = (targetNetId || targetUid).toLowerCase();
      if (netIdToSearch) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('netid', '==', netIdToSearch));
        const snap = await getDocs(q);
        if (!snap.empty) {
          resolvedMember = snap.docs[0].data() as UserProfile;
          targetUid = resolvedMember.uid;
        }
      }

      if (!resolvedMember && targetUid) {
        try {
          const userDocSnap = await getDoc(doc(db, 'users', targetUid));
          if (userDocSnap.exists()) {
            resolvedMember = userDocSnap.data() as UserProfile;
          }
        } catch {
          // ignore lookup fallback
        }
      }

      if (!targetUid) {
        throw new Error('Invalid QR code format. Missing user identifier.');
      }

      const activeEvent = selectedEvent === 'Custom' ? (customEventName || 'Custom Event') : selectedEvent;

      // CONDITION: Only verified, active members earn and accrue attendance points in Firestore upon scanning/signing in.
      // Non-members can sign in for attendance records, but receive 0 points.
      const isActiveMember = resolvedMember 
        ? (resolvedMember.isDuePaying === true || resolvedMember.isPaidMember === true || resolvedMember.role === 'officer' || (resolvedMember.email?.toLowerCase() === 'shpetxst@gmail.com'))
        : false;

      const memberName = resolvedMember?.fullName || resolvedMember?.displayName || (targetNetId ? `Student ${targetNetId}` : 'Attendee');
      const netIdVal = resolvedMember?.netid || resolvedMember?.studentId || targetNetId || 'N/A';
      const emailVal = resolvedMember?.email || (netIdVal !== 'N/A' ? `${netIdVal}@txstate.edu` : '');

      await recordAttendanceLog({
        userId: targetUid,
        memberName,
        netid: netIdVal,
        email: emailVal,
        eventName: activeEvent,
        nominalPoints: pointValue,
        isActiveMember,
        scannedBy: user?.email || 'shpetxst@gmail.com',
      });

      if (isActiveMember) {
        playSound(true);
        const resultItem: ScannedMemberResult = {
          status: 'success',
          member: resolvedMember || undefined,
          message: `Active Member Verified! +${pointValue} points credited to ${memberName} (${netIdVal}). Logged in Time Records.`,
          pointsAdded: pointValue,
          timestamp: new Date().toLocaleTimeString(),
        };
        setLastScannedResult(resultItem);
        setScanHistory((prev) => [resultItem, ...prev.slice(0, 19)]);
        setQuickPayMember(null);
      } else {
        // Non-member / guest check-in
        playSound(false);
        const resultItem: ScannedMemberResult = {
          status: 'blocked',
          member: resolvedMember || undefined,
          message: `Guest Check-In Recorded: ${memberName} (${netIdVal}) signed in with 0 points. Active dues required to accrue points.`,
          pointsAdded: 0,
          timestamp: new Date().toLocaleTimeString(),
        };
        setLastScannedResult(resultItem);
        setScanHistory((prev) => [resultItem, ...prev.slice(0, 19)]);
        if (resolvedMember) {
          setQuickPayMember(resolvedMember);
        }
      }
    } catch (err: unknown) {
      playSound(false);
      const errMsg = err instanceof Error ? err.message : 'Failed to parse scanned QR code';
      const resultItem: ScannedMemberResult = {
        status: 'error',
        message: errMsg,
        timestamp: new Date().toLocaleTimeString(),
      };
      setLastScannedResult(resultItem);
    } finally {
      setIsProcessing(false);
      // Brief debounce before accepting next scan
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 2000);
    }
  }, [pointValue, selectedEvent, customEventName, user?.email]);

  const stopCamera = useCallback(async () => {
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
        qrScannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping camera:', err);
      }
      qrScannerRef.current = null;
    }
    setCameraState('stopped');
  }, []);

  const startCamera = useCallback(async (facing: 'environment' | 'user' = 'environment', overrideDeviceId?: string) => {
    if (!isAdmin) return;
    setCameraError(null);
    setCameraState('starting');

    const container = document.getElementById('qr-reader-container');
    if (!container) {
      console.warn('Scanner container not yet mounted');
      setCameraState('error');
      return;
    }

    try {
      // 1. Clean up any existing scanner instance
      if (qrScannerRef.current) {
        try {
          if (qrScannerRef.current.isScanning) {
            await qrScannerRef.current.stop();
          }
          qrScannerRef.current.clear();
        } catch {
          // ignore
        }
        qrScannerRef.current = null;
      }

      // 2. Discover available cameras if not already listed
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setAvailableCameras(devices.map(d => ({ id: d.id, label: d.label || `Camera ${d.id.slice(0, 5)}` })));
        }
      } catch (devErr) {
        console.warn('Could not enumerate cameras:', devErr);
      }

      const qrScanner = new Html5Qrcode('qr-reader-container');
      qrScannerRef.current = qrScanner;

      const activeDeviceId = overrideDeviceId || selectedCameraId;
      const cameraConfig = activeDeviceId 
        ? activeDeviceId 
        : { facingMode: facing };

      await qrScanner.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleProcessScan(decodedText);
        },
        () => {
          // scan frame attempt without QR - ignore
        }
      );

      setCameraState('running');
    } catch (err: unknown) {
      console.warn('Camera start primary attempt error:', err);

      // Fallback: try user facing or unconstrained camera
      try {
        if (qrScannerRef.current) {
          try {
            if (qrScannerRef.current.isScanning) {
              await qrScannerRef.current.stop();
            }
            qrScannerRef.current.clear();
          } catch {
            // ignore
          }
        }

        const qrScanner = new Html5Qrcode('qr-reader-container');
        qrScannerRef.current = qrScanner;

        await qrScanner.start(
          { facingMode: 'user' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleProcessScan(decodedText);
          },
          () => {}
        );
        setFacingMode('user');
        setCameraState('running');
        return;
      } catch (fallbackErr) {
        console.warn('Camera fallback error:', fallbackErr);
      }

      setCameraState('error');
      const errMessage = err instanceof Error ? err.message : String(err);
      if (errMessage.includes('NotAllowedError') || errMessage.includes('Permission denied')) {
        setCameraError('Camera access was denied. Please allow camera permissions in your browser address bar.');
      } else if (errMessage.includes('NotFoundError') || errMessage.includes('DevicesNotFoundError')) {
        setCameraError('No camera found on this device. You can scan by uploading a photo or typing NetID manually.');
      } else {
        setCameraError('Could not start camera stream. Use image upload or manual NetID below.');
      }
    }
  }, [isAdmin, handleProcessScan, selectedCameraId]);

  // Handle active camera lifecycle
  useEffect(() => {
    if (!isAdmin || !cameraActive) {
      stopCamera();
      return;
    }

    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) {
        startCamera(facingMode, selectedCameraId);
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopCamera();
    };
  }, [isAdmin, cameraActive, facingMode, selectedCameraId, startCamera, stopCamera]);

  const handleToggleCamera = () => {
    if (cameraActive) {
      setCameraActive(false);
      stopCamera();
    } else {
      setCameraActive(true);
      startCamera(facingMode);
    }
  };

  const handleFlipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (cameraActive) {
      startCamera(nextMode);
    }
  };

  const handleScanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        await qrScannerRef.current.stop();
      }
      const qrScanner = new Html5Qrcode('qr-reader-container');
      qrScannerRef.current = qrScanner;
      const decodedText = await qrScanner.scanFile(file, true);
      handleProcessScan(decodedText);
    } catch {
      alert('Could not detect a valid QR code in the selected photo. Please try another image or enter the NetID manually.');
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleProcessScan(manualInput.trim());
    setManualInput('');
  };

  const handleCollectDuesNow = async (memberToPay: UserProfile) => {
    try {
      await updateDuePayingStatus(memberToPay.uid, true);
      // Re-trigger points award immediately now that dues are confirmed!
      await handleProcessScan(memberToPay.uid);
      setQuickPayMember(null);
    } catch (err) {
      alert('Failed to update due-paying status: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Guard: Strictly accessible by admin account shpetxst@gmail.com
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 pt-32 pb-20 px-4">
        <div className="max-w-md mx-auto bg-white rounded-3xl shadow-xl border border-red-100 p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl mx-auto flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Restricted Admin Access</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            The Event Attendance Scanner is reserved strictly for the Chapter Administrator account (<strong>shpetxst@gmail.com</strong>).
          </p>
          <Link
            to="/profile"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl text-sm"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-20 px-4 animate-fade-in">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-xs border border-gray-100">
          <div className="flex items-center space-x-3">
            <Link 
              to="/profile" 
              className="p-2.5 text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              title="Back to Profile"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center space-x-2">
                <span className="bg-primary-100 text-primary-800 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md tracking-wider">
                  Admin Tool
                </span>
                <span className="text-xs text-gray-500 font-mono">Logged in as {user.email}</span>
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                Event Attendance & Merit Scanner
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/analytics"
              className="px-3.5 py-2 bg-primary-50 hover:bg-primary-100 text-primary-900 border border-primary-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors"
            >
              <span>Time Logs & Analytics &rarr;</span>
            </Link>
            <button
              onClick={() => setCameraActive(!cameraActive)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                cameraActive 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{cameraActive ? 'Camera Scanner Active' : 'Enable Camera'}</span>
            </button>
          </div>
        </div>

        {/* Event Setup Card */}
        <div className="bg-white rounded-3xl shadow-xs border border-gray-100 p-6 space-y-4">
          <div className="flex items-center space-x-2 text-primary-900 font-bold text-sm">
            <Calendar className="w-4 h-4 text-primary-600" />
            <span>Select Event & Award Points Value</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Active Event</label>
              <select
                value={selectedEvent}
                onChange={(e) => {
                  const ev = e.target.value;
                  setSelectedEvent(ev);
                  const found = eventCategories.find((p) => p.name === ev);
                  if (found) setPointValue(found.points);
                }}
                className="w-full text-xs px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 font-medium"
              >
                {eventCategories.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name} (+{cat.points} pts)
                  </option>
                ))}
                <option value="Custom">Custom Event Name...</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700">Points to Award</label>
              <input
                type="number"
                step="0.5"
                min={0.5}
                max={100}
                value={pointValue}
                onChange={(e) => setPointValue(Number(e.target.value))}
                className="w-full text-xs font-bold font-mono px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {selectedEvent === 'Custom' && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-gray-700">Custom Event Title</label>
              <input
                type="text"
                placeholder="e.g. End of Semester Banquet"
                value={customEventName}
                onChange={(e) => setCustomEventName(e.target.value)}
                className="w-full text-xs px-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 font-medium"
              />
            </div>
          )}
        </div>

        {/* Live QR Scanner and Feedback Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* Scanner Viewport */}
          <div className="bg-white rounded-3xl shadow-xs border border-gray-100 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-gray-800">
                <Camera className="w-4 h-4 text-primary-600" />
                <span>Live QR Code Camera Reader</span>
              </div>

              {/* Camera Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleToggleCamera}
                  className={`p-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                    cameraActive 
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={cameraActive ? 'Turn Camera Off' : 'Turn Camera On'}
                >
                  {cameraActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{cameraActive ? 'Camera On' : 'Paused'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleFlipCamera}
                  disabled={!cameraActive}
                  className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-medium transition-colors disabled:opacity-40"
                  title="Switch Front/Back Camera"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                </button>

                {availableCameras.length > 1 && (
                  <select
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="text-[11px] p-1.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 font-medium focus:ring-1 focus:ring-primary-500"
                    title="Select Camera Device"
                  >
                    <option value="">Auto / Default</option>
                    {availableCameras.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.label}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 bg-primary-50 hover:bg-primary-100 text-primary-700 rounded-xl text-xs font-medium transition-colors flex items-center space-x-1"
                  title="Scan QR from Image File or Screenshot"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Upload QR</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleScanImageFile}
                  className="hidden"
                />
              </div>
            </div>

            {/* Camera Viewport Container */}
            <div className="relative overflow-hidden rounded-2xl bg-gray-950 border-2 border-primary-500/40 min-h-[300px] flex items-center justify-center text-white">
              <div id="qr-reader-container" className="w-full"></div>

              {/* Status Overlay Banner */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
                {cameraState === 'running' ? (
                  <span className="px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-full text-[11px] font-bold text-emerald-400 flex items-center space-x-1.5 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Aim camera at student QR code</span>
                  </span>
                ) : cameraState === 'starting' ? (
                  <span className="px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-full text-[11px] font-bold text-amber-300 flex items-center space-x-1.5 border border-amber-500/30">
                    <RefreshCw className="w-3 h-3 animate-spin text-amber-300" />
                    <span>Accessing Camera Stream...</span>
                  </span>
                ) : cameraState === 'stopped' ? (
                  <span className="px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-full text-[11px] font-bold text-gray-300 border border-gray-700">
                    Camera Stream Paused
                  </span>
                ) : null}

                {isProcessing && (
                  <span className="px-2.5 py-1 bg-primary-900/90 backdrop-blur-md rounded-full text-[11px] font-bold text-white flex items-center space-x-1.5 border border-primary-400">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Validating Check-In...</span>
                  </span>
                )}
              </div>

              {/* Camera Error / Stopped Empty State */}
              {(cameraState === 'error' || cameraState === 'stopped') && (
                <div className="absolute inset-0 bg-gray-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
                  <div className="w-12 h-12 bg-gray-800 rounded-2xl flex items-center justify-center text-gray-400">
                    {cameraState === 'error' ? <AlertCircle className="w-6 h-6 text-amber-400" /> : <VideoOff className="w-6 h-6" />}
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <h5 className="text-sm font-extrabold text-white">
                      {cameraState === 'error' ? 'Camera Notice' : 'Scanner Paused'}
                    </h5>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {cameraError || 'Camera is paused. Turn on camera, upload a photo, or check in via NetID below.'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCameraActive(true);
                        startCamera(facingMode);
                      }}
                      className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                    >
                      {cameraState === 'error' ? 'Retry Camera' : 'Resume Camera'}
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-bold transition-colors"
                    >
                      Upload QR Image
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Manual Entry Fallback */}
            <form onSubmit={handleManualSubmit} className="pt-2 border-t border-gray-100 space-y-2">
              <label className="text-[11px] font-bold text-gray-600">
                Manual Fallback: Enter Member NetID or User ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. abc12 or user UID"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="flex-1 text-xs font-mono uppercase px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 font-bold"
                />
                <button
                  type="submit"
                  disabled={isProcessing || !manualInput.trim()}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                >
                  Check In
                </button>
              </div>
            </form>
          </div>

          {/* Real-time Status Card & Restrictions Notice */}
          <div className="space-y-6">
            
            {/* Last Scan Result Card */}
            {lastScannedResult ? (
              <div className={`p-6 rounded-3xl border-2 transition-all shadow-md ${
                lastScannedResult.status === 'success'
                  ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950'
                  : lastScannedResult.status === 'blocked'
                  ? 'bg-amber-50/90 border-amber-400 text-amber-950'
                  : 'bg-red-50/90 border-red-300 text-red-950'
              }`}>
                <div className="flex items-start space-x-3">
                  {lastScannedResult.status === 'success' ? (
                    <div className="p-2 bg-emerald-600 text-white rounded-2xl">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                  ) : lastScannedResult.status === 'blocked' ? (
                    <div className="p-2 bg-amber-600 text-white rounded-2xl">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="p-2 bg-red-600 text-white rounded-2xl">
                      <ShieldAlert className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-sm uppercase tracking-wide">
                        {lastScannedResult.status === 'success'
                          ? 'Attendance Recorded!'
                          : lastScannedResult.status === 'blocked'
                          ? 'Points Blocked (Dues Required)'
                          : 'Scan Error'}
                      </h4>
                      <span className="text-[10px] font-mono font-bold opacity-75">
                        {lastScannedResult.timestamp}
                      </span>
                    </div>

                    <p className="text-xs font-medium leading-relaxed">
                      {lastScannedResult.message}
                    </p>

                    {lastScannedResult.status === 'success' && (
                      <div className="pt-2 flex items-center space-x-4">
                        <span className="text-xs font-bold text-emerald-800 bg-white/80 px-2.5 py-1 rounded-lg border border-emerald-300">
                          +{lastScannedResult.pointsAdded} Points
                        </span>
                        <span className="text-xs font-bold text-emerald-900">
                          Total Score: {lastScannedResult.newTotal} pts
                        </span>
                      </div>
                    )}

                    {/* Quick Dues Collection Button for Admin */}
                    {quickPayMember && (
                      <div className="pt-3 border-t border-amber-200 mt-2 space-y-2">
                        <p className="text-[11px] font-medium text-amber-900">
                          Did <strong>{quickPayMember.fullName || quickPayMember.displayName || quickPayMember.netid}</strong> just pay chapter dues at the door?
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCollectDuesNow(quickPayMember)}
                          className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                        >
                          <DollarSign className="w-4 h-4" />
                          <span>Mark Dues as Paid & Award Points</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-white rounded-3xl border border-gray-100 text-center space-y-3">
                <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-2xl mx-auto flex items-center justify-center">
                  <Award className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-extrabold text-gray-800">Scanner Ready</h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                  Hold a student's digital member QR code up to the camera or type their NetID below to award merit points.
                </p>
              </div>
            )}

            {/* Dues Policy Restriction Info */}
            <div className="p-4 bg-primary-50/60 rounded-2xl border border-primary-200 space-y-2 text-xs text-primary-900">
              <div className="flex items-center space-x-2 font-bold">
                <Sparkles className="w-4 h-4 text-primary-600" />
                <span>Chapter Policy: Due-Paying Members Only</span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">
                By chapter constitution, only members with confirmed chapter dues accumulate merit points and leaderboard ranking. Unpaid members receive a notice to pay chapter dues (Semester: $30, Full Year: $40).
              </p>
            </div>

            {/* Session Scan Log */}
            {scanHistory.length > 0 && (
              <div className="bg-white rounded-3xl border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-gray-800">
                  <span>Session Attendance Log ({scanHistory.length})</span>
                  <button
                    onClick={() => setScanHistory([])}
                    className="text-[10px] text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {scanHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl text-xs flex items-center justify-between ${
                        item.status === 'success'
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {item.status === 'success' ? (
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                        )}
                        <span className="font-semibold text-[11px] truncate max-w-[200px]">
                          {item.message}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                        {item.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};

export default AdminScanner;
