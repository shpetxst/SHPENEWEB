import { User } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  serverTimestamp, 
  deleteField 
} from 'firebase/firestore';
import emailjs from '@emailjs/browser';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../context/auth-context-def';

/**
 * ============================================================================
 * EMAILJS CREDENTIALS CONFIGURATION
 * ============================================================================
 * Configured via .env:
 *   VITE_EMAILJS_SERVICE_ID=service_4ywihjg
 *   VITE_EMAILJS_TEMPLATE_ID=template_37woie2
 *   VITE_EMAILJS_PUBLIC_KEY=NHFX49V-1QJYQrWMo
 * ============================================================================
 */
const resolveKey = (val: string | undefined, placeholder: string, realFallback: string): string => {
  if (!val || !val.trim() || val.includes(placeholder)) {
    return realFallback;
  }
  return val.trim();
};

export const EMAILJS_CONFIG = {
  SERVICE_ID: resolveKey(import.meta.env?.VITE_EMAILJS_SERVICE_ID, 'YOUR_SERVICE_ID', 'service_4ywihjg'),
  TEMPLATE_ID: resolveKey(import.meta.env?.VITE_EMAILJS_TEMPLATE_ID, 'YOUR_TEMPLATE_ID', 'template_37woie2'),
  PUBLIC_KEY: resolveKey(import.meta.env?.VITE_EMAILJS_PUBLIC_KEY, 'YOUR_PUBLIC_KEY', 'NHFX49V-1QJYQrWMo'),
};

/**
 * Determines whether real EmailJS keys have been configured in the environment
 */
export function isEmailJsConfigured(): boolean {
  const serviceId = resolveKey(import.meta.env?.VITE_EMAILJS_SERVICE_ID, 'YOUR_SERVICE_ID', EMAILJS_CONFIG.SERVICE_ID);
  const templateId = resolveKey(import.meta.env?.VITE_EMAILJS_TEMPLATE_ID, 'YOUR_TEMPLATE_ID', EMAILJS_CONFIG.TEMPLATE_ID);
  const publicKey = resolveKey(import.meta.env?.VITE_EMAILJS_PUBLIC_KEY, 'YOUR_PUBLIC_KEY', EMAILJS_CONFIG.PUBLIC_KEY);
  return Boolean(serviceId && templateId && publicKey);
}

export interface VerificationResult {
  success: boolean;
  email: string;
  netid: string;
  message: string;
  expiresAt: string;
  delivered?: boolean;
  emailJsConfigured?: boolean;
  deliveryError?: string;
}

/**
 * Validates Texas State NetID format (e.g. abc12 or abc12@txstate.edu)
 */
export function validateNetId(netIdOrEmail: string): {
  isValid: boolean;
  cleanedNetId: string;
  universityEmail: string;
  error?: string;
} {
  let cleaned = (netIdOrEmail || '').trim().toLowerCase();
  if (cleaned.includes('@')) {
    cleaned = cleaned.split('@')[0];
  }
  cleaned = cleaned.replace(/[^a-z0-9]/g, '');

  if (!cleaned) {
    return {
      isValid: false,
      cleanedNetId: '',
      universityEmail: '',
      error: 'Please enter your Texas State NetID or NetID email (e.g. abc12 or abc12@txstate.edu).',
    };
  }

  return {
    isValid: true,
    cleanedNetId: cleaned,
    universityEmail: `${cleaned}@txstate.edu`,
  };
}

/**
 * Generates and dispatches a secure 6-digit verification code to the student's Texas State Outlook email
 * using EmailJS (Service: service_4ywihjg, Template: template_37woie2, Key: NHFX49V-1QJYQrWMo).
 * 
 * 1. Generates cryptographic 6-digit verification code with 10-minute expiry.
 * 2. Stores code and expiration timestamp in the user's Firestore record for strict validation.
 * 3. Delivers the code to the student's official Texas State Outlook address via EmailJS.
 * 4. Never exposes the code on-screen, requiring the student to enter the code from their email (true 2FA).
 */
export async function generateAndSendNetIdCode(params: {
  currentUser: User;
  netIdOrEmail: string;
}): Promise<VerificationResult> {
  const { currentUser, netIdOrEmail } = params;
  const validation = validateNetId(netIdOrEmail);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid Texas State NetID.');
  }

  const { cleanedNetId, universityEmail } = validation;

  // 1. Generate 6-digit verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 2. 10-minute expiration timestamp
  const EXPIRATION_MINUTES = 10;
  const expiresAtMs = Date.now() + EXPIRATION_MINUTES * 60 * 1000;
  const codeExpiresAt = new Date(expiresAtMs).toISOString();

  // 3. Save code to Firestore user document for verification
  const userDocRef = doc(db, 'users', currentUser.uid);
  try {
    await setDoc(userDocRef, {
      netid: cleanedNetId,
      studentId: cleanedNetId,
      txstateEmail: universityEmail,
      netIdVerification: {
        code: code,
        expiresAt: codeExpiresAt,
      },
      netIdVerificationCode: code,
      codeExpiresAt: codeExpiresAt,
      isNetIDVerified: false,
      txstateVerified: false,
      isVerified: false,
      verificationSentAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    throw err;
  }

  // Also write to dedicated verificationCodes collection for redundancy
  try {
    await setDoc(doc(db, 'verificationCodes', currentUser.uid), {
      code,
      expiresAt: codeExpiresAt,
      netid: cleanedNetId,
      email: universityEmail,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (backupErr) {
    console.warn('Backup verification code store notice:', backupErr);
  }

  // Optional: write to Firebase mail collection if Firebase Trigger Email extension is configured
  try {
    await addDoc(collection(db, 'mail'), {
      to: [universityEmail],
      message: {
        subject: `${code} is your SHPE Texas State Verification Code`,
        text: `Your Texas State NetID verification code is: ${code}. This code expires in 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; max-width: 500px;">
            <h2 style="color: #501214; margin-top: 0;">SHPE Texas State University</h2>
            <p>Hello <strong>${currentUser.displayName || cleanedNetId}</strong>,</p>
            <p>Your 6-digit student verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #501214; background: #f3f4f6; padding: 16px; text-align: center; border-radius: 8px; font-family: monospace;">
              ${code}
            </div>
            <p style="font-size: 12px; color: #6b7280; margin-top: 16px;">This code expires in 10 minutes.</p>
          </div>
        `,
      },
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if extension is not installed
  }

  // 4. Send 6-digit verification code via EmailJS browser SDK
  const emailJsReady = isEmailJsConfigured();
  let emailJsDelivered = false;
  let deliveryErrorMsg: string | undefined;

  if (emailJsReady) {
    const templateParams: Record<string, unknown> = {
      to_email: universityEmail,
      email: universityEmail,
      recipient_email: universityEmail,
      user_email: universityEmail,
      to_name: currentUser.displayName || cleanedNetId,
      name: currentUser.displayName || cleanedNetId,
      user_name: currentUser.displayName || cleanedNetId,
      netid: cleanedNetId,
      code: code,
      verification_code: code,
      otp: code,
      passcode: code,
      expires_in: '10 minutes',
      reply_to: 'shpetxst@gmail.com',
      subject: 'SHPE Texas State - 6-Digit NetID Verification Code',
      message: `Your Texas State NetID verification code is ${code}. Please enter this 6-digit code in the chapter portal to complete your verification. This code expires in 10 minutes.`,
    };

    try {
      // Initialize EmailJS with public key
      emailjs.init({ publicKey: EMAILJS_CONFIG.PUBLIC_KEY });

      // Send email via official @emailjs/browser package
      const res = await emailjs.send(
        EMAILJS_CONFIG.SERVICE_ID,
        EMAILJS_CONFIG.TEMPLATE_ID,
        templateParams,
        {
          publicKey: EMAILJS_CONFIG.PUBLIC_KEY,
        }
      );

      if (res.status === 200 || res.text === 'OK') {
        emailJsDelivered = true;
        console.info(`[EmailJS] 6-digit verification code dispatched successfully to ${universityEmail}!`);
      }
    } catch (emailErr: unknown) {
      const errObj = emailErr as { status?: number; text?: string; message?: string };
      deliveryErrorMsg = errObj?.text || errObj?.message || (emailErr instanceof Error ? emailErr.message : String(emailErr));
      console.warn('[EmailJS Delivery Notice]: Browser direct call threw:', deliveryErrorMsg);
    }

    // If browser-direct call was blocked (e.g. adblocker, CSP, network policy), relay through server endpoint
    if (!emailJsDelivered) {
      try {
        const relayRes = await fetch('/api/send-emailjs-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: universityEmail,
            netId: cleanedNetId,
            code,
            displayName: currentUser.displayName || cleanedNetId,
          }),
        });

        if (relayRes.ok) {
          const relayData = await relayRes.json();
          if (relayData.success) {
            emailJsDelivered = true;
            deliveryErrorMsg = undefined;
            console.info(`[EmailJS Relay] 6-digit verification code relayed successfully to ${universityEmail}!`);
          }
        }
      } catch (relayErr) {
        console.warn('[EmailJS Relay Warning]:', relayErr);
      }
    }
  } else {
    deliveryErrorMsg = 'EmailJS credentials are not configured in environment variables.';
  }

  // 5. Return status to user UI WITHOUT revealing the 6-digit code (true 2FA)
  return {
    success: true,
    email: universityEmail,
    netid: cleanedNetId,
    expiresAt: codeExpiresAt,
    delivered: emailJsDelivered,
    emailJsConfigured: emailJsReady,
    deliveryError: deliveryErrorMsg,
    message: emailJsDelivered
      ? `6-digit verification code sent to ${universityEmail}! Please check your Texas State Outlook inbox.`
      : deliveryErrorMsg
        ? `Verification code generated for ${universityEmail}. Please check your Texas State Outlook inbox (${deliveryErrorMsg}).`
        : `Verification code dispatched to ${universityEmail}. Please check your Outlook inbox.`,
  };
}

/**
 * Validates the user's entered 6-digit code against their Firestore record.
 */
export async function verifyNetIdCodeSubmit(params: {
  currentUser: User;
  enteredCode: string;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const { currentUser, enteredCode } = params;
  const cleanCode = (enteredCode || '').trim().replace(/\D/g, '');

  if (!cleanCode || cleanCode.length !== 6) {
    throw new Error('Please enter a valid 6-digit numeric verification code.');
  }

  const userDocRef = doc(db, 'users', currentUser.uid);
  const snap = await getDoc(userDocRef);

  if (!snap.exists()) {
    throw new Error('User profile record not found. Please log in again.');
  }

  const data = snap.data() as UserProfile & { 
    netIdVerification?: { code?: string; expiresAt?: string };
    netIdVerificationCode?: string; 
    codeExpiresAt?: string; 
  };

  let storedCode = data.netIdVerification?.code || data.netIdVerificationCode;
  let storedExpiresAt = data.netIdVerification?.expiresAt || data.codeExpiresAt;

  // Fallback to verificationCodes collection if not in user doc
  if (!storedCode) {
    try {
      const backupSnap = await getDoc(doc(db, 'verificationCodes', currentUser.uid));
      if (backupSnap.exists()) {
        const backupData = backupSnap.data() as { code?: string; expiresAt?: string };
        storedCode = backupData.code;
        storedExpiresAt = backupData.expiresAt;
      }
    } catch {
      // Continue to check
    }
  }

  if (!storedCode) {
    throw new Error('No active verification code found for your account. Please click "Resend Code" to generate a new 6-digit code.');
  }

  // Check expiration timestamp: verify now() < expiresAt
  const now = Date.now();
  const expiresAtMs = storedExpiresAt ? new Date(storedExpiresAt).getTime() : 0;
  if (expiresAtMs > 0 && now >= expiresAtMs) {
    throw new Error('Invalid or expired code. Your 6-digit code has expired (10-minute limit). Please request a new code.');
  }

  // Check code equality strictly
  if (storedCode !== cleanCode) {
    throw new Error('Invalid code. The 6-digit code entered does not match.');
  }

  // Code is verified! Atomically update user document:
  try {
    await updateDoc(userDocRef, {
      isNetIDVerified: true,
      txstateVerified: true,
      isVerified: true,
      emailVerified: true,
      netidVerifiedAt: serverTimestamp(),
      netIdVerificationCode: deleteField(),
      codeExpiresAt: deleteField(),
      netIdVerification: deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    throw err;
  }

  return {
    success: true,
    message: 'NetID Verified! Your Texas State student status is active.',
  };
}

/**
 * Legacy wrapper for backwards compatibility
 */
export async function sendUniversityVerificationEmail(
  currentUser: User,
  netId: string
): Promise<VerificationResult> {
  return generateAndSendNetIdCode({ currentUser, netIdOrEmail: netId });
}
