import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  CheckCircle2, 
  QrCode, 
  Award, 
  Calendar, 
  CreditCard, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { claimAttendanceCodeWithTransaction } from '../../services/eventAttendanceService';

export const CheckInPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user, userProfile } = useAuth();

  const codeParam = searchParams.get('code') || '';
  const eventParam = searchParams.get('event') || '';
  const pointsParam = Number(searchParams.get('points')) || 10;

  const [attendanceCode, setAttendanceCode] = useState(codeParam);
  const [eventName, setEventName] = useState(eventParam || 'General Body Meeting');
  const [nominalPoints, setNominalPoints] = useState(pointsParam);

  const [fullName, setFullName] = useState('');
  const [netid, setNetId] = useState('');
  const [email, setEmail] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    success: boolean;
    points: number;
    message: string;
    isMember: boolean;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pre-fill fields if user is authenticated
  useEffect(() => {
    if (user) {
      if (userProfile?.fullName || user.displayName) {
        setFullName(userProfile?.fullName || user.displayName || '');
      }
      if (userProfile?.netid || userProfile?.studentId) {
        setNetId(userProfile?.netid || userProfile?.studentId || '');
      } else if (user.email && user.email.includes('@')) {
        setNetId(user.email.split('@')[0]);
      }
      if (user.email) {
        setEmail(user.email);
      }
    }
  }, [user, userProfile]);

  useEffect(() => {
    if (codeParam) setAttendanceCode(codeParam);
    if (eventParam) setEventName(eventParam);
    if (pointsParam) setNominalPoints(pointsParam);
  }, [codeParam, eventParam, pointsParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = fullName.trim();
    const cleanNetId = netid.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = attendanceCode.trim();

    if (!cleanName) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!cleanNetId) {
      setErrorMessage('Please enter your Texas State NetID (e.g. abc123).');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await claimAttendanceCodeWithTransaction({
        attendanceCode: cleanCode,
        userId: user?.uid || (cleanNetId ? `netid_${cleanNetId}` : ''),
        netId: cleanNetId,
        memberName: cleanName,
        email: cleanEmail || `${cleanNetId}@txstate.edu`,
      });

      setSubmittedResult({
        success: true,
        points: res.pointsEarned,
        message: res.message,
        isMember: res.memberStatus === 'active_member',
      });
    } catch (err) {
      console.error('Check-in submission error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to record check-in. Please verify the code on screen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-28 pb-20 px-4 sm:px-6 animate-fade-in">
      <div className="max-w-xl mx-auto space-y-6">

        {/* HEADER BRANDING */}
        <div className="bg-[#501214] text-white rounded-3xl p-6 sm:p-8 shadow-xl border-2 border-[#501214] text-center space-y-3">
          <div className="inline-flex items-center space-x-2 bg-white/10 px-3.5 py-1.5 rounded-full text-xs font-black text-[#C4A47C] border border-white/20">
            <QrCode className="w-4 h-4 text-[#C4A47C]" />
            <span>Official Event Check-In Portal</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {eventName || 'SHPE Texas State Meeting'}
          </h1>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-xs">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white text-[#501214] rounded-lg font-black shadow-xs">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </span>
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 bg-[#C4A47C] text-[#501214] rounded-lg font-black shadow-xs">
              <Award className="w-3.5 h-3.5" />
              <span>+{nominalPoints} Merit Points</span>
            </span>
          </div>
        </div>

        {/* SUBMISSION CONFIRMATION SCREEN */}
        {submittedResult ? (
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border-2 border-gray-200 text-center space-y-6 animate-scale-up">
            <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center shadow-lg ${
              submittedResult.isMember ? 'bg-[#501214] text-white' : 'bg-[#1A1A1A] text-[#C4A47C]'
            }`}>
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>

            <div className="space-y-2">
              <span className={`text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                submittedResult.isMember
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}>
                {submittedResult.isMember ? 'Verified Active Member' : 'Guest / Non-Member Check-In'}
              </span>

              <h2 className="text-2xl font-black text-[#1A1A1A]">
                Check-In Confirmed!
              </h2>

              <p className="text-xs sm:text-sm text-gray-700 max-w-md mx-auto">
                {submittedResult.isMember ? (
                  <>
                    Thank you for attending, <strong className="text-[#501214] font-black">{fullName}</strong>. Your arrival timestamp and <strong className="text-[#501214] font-black">+{submittedResult.points} merit points</strong> have been recorded in the live chapter database.
                  </>
                ) : (
                  <>
                    Welcome to SHPE Texas State, <strong className="text-[#1A1A1A] font-black">{fullName}</strong>! Your attendance is recorded. By chapter constitution, dues must be paid to activate merit points and convention travel eligibility.
                  </>
                )}
              </p>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                to="/programs/merits"
                className="w-full sm:w-auto px-5 py-3 bg-[#501214] hover:bg-[#420f11] text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <Award className="w-4 h-4 text-[#C4A47C]" />
                <span>View Merit Leaderboard</span>
              </Link>

              {!submittedResult.isMember && (
                <Link
                  to="/membership"
                  className="w-full sm:w-auto px-5 py-3 bg-[#C4A47C] hover:bg-[#b09068] text-[#501214] text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  <CreditCard className="w-4 h-4 text-[#501214]" />
                  <span>Pay Dues ($30 / $40)</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => setSubmittedResult(null)}
                className="w-full sm:w-auto px-4 py-3 bg-white text-gray-700 hover:text-[#1A1A1A] text-xs font-bold rounded-xl border-2 border-gray-300 transition-colors"
              >
                Check In Another Student
              </button>
            </div>
          </div>
        ) : (
          /* CHECK-IN FORM */
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-md border-2 border-gray-200 space-y-6">
            <div className="border-b-2 border-gray-200 pb-4">
              <h2 className="text-lg font-black text-[#1A1A1A]">Student Attendance Form</h2>
              <p className="text-xs text-gray-600">
                Enter your Texas State NetID and name to log your arrival and earn merit points.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3.5 bg-red-700 text-white rounded-xl text-xs font-black flex items-center space-x-2 shadow-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-black text-[#1A1A1A] mb-1">
                  Student Full Name (First &amp; Last Name) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Adrian Bobcat"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-3 bg-white border-2 border-gray-300 rounded-xl focus:border-[#501214] font-bold text-[#1A1A1A] text-xs focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-black text-[#1A1A1A] mb-1">
                  Texas State NetID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ah849"
                  value={netid}
                  onChange={(e) => setNetId(e.target.value.toLowerCase())}
                  className="w-full p-3 bg-white border-2 border-gray-300 rounded-xl focus:border-[#501214] font-mono font-bold text-[#1A1A1A] text-xs focus:outline-hidden"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Your university NetID identifier (letters and numbers, not your 9-digit student A-ID).
                </p>
              </div>

              <div>
                <label className="block font-black text-[#1A1A1A] mb-1">
                  Google Email Address
                </label>
                <input
                  type="email"
                  placeholder="e.g. ah849@txstate.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 bg-white border-2 border-gray-300 rounded-xl focus:border-[#501214] font-medium text-[#1A1A1A] text-xs focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-black text-[#1A1A1A] mb-1">
                  Meeting Attendance Code
                </label>
                <input
                  type="text"
                  placeholder="Displayed on projector screen"
                  value={attendanceCode}
                  onChange={(e) => setAttendanceCode(e.target.value.toUpperCase())}
                  className="w-full p-3 bg-white border-2 border-gray-300 rounded-xl focus:border-[#501214] font-mono font-black text-[#501214] text-xs focus:outline-hidden uppercase tracking-wider"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 bg-[#501214] hover:bg-[#420f11] text-white font-black text-sm rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Recording Check-In...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#C4A47C]" />
                      <span>Submit Meeting Check-In</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* BOTTOM HELP FOOTER */}
        <div className="text-center text-xs text-gray-600 space-y-1">
          <p>Society of Hispanic Professional Engineers • Texas State University Chapter</p>
          <p>Need assistance with your dues or points? Contact <strong className="text-[#501214]">shpetxst@gmail.com</strong></p>
        </div>

      </div>
    </div>
  );
};

export default CheckInPage;
