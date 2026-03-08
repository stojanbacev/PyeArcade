import React, { useEffect, useMemo, useRef, useState } from 'react';
import { payments as createSquarePayments } from '@square/web-sdk';
import { X, CreditCard as CreditCardIcon, Apple, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const SQUARE_APPLICATION_ID = 'sandbox-sq0idb-Zjxl-Se1TSlNgY3j9YK5Iw';

const CREDIT_PACKAGES = [
  { credits: 10, price: 5.0 },
  { credits: 25, price: 10.0 },
  { credits: 60, price: 20.0 },
  { credits: 150, price: 50.0 },
];

function formatMoney(amount) {
  return `$${amount.toFixed(2)}`;
}

export default function CreditReload({ onBack, onSuccess }) {
  const { updateCredits } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState(CREDIT_PACKAGES[0]);
  const [status, setStatus] = useState('idle'); // idle, submitting, success, error
  const [message, setMessage] = useState('');
  const [canUseApplePay, setCanUseApplePay] = useState(false);
  const [canUseGooglePay, setCanUseGooglePay] = useState(false);

  const cardContainerRef = useRef(null);
  const cardRef = useRef(null);
  const applePayRef = useRef(null);
  const googlePayRef = useRef(null);

  const paymentRequest = useMemo(() => {
    return {
      countryCode: 'US',
      currencyCode: 'USD',
      total: {
        amount: selectedPackage.price.toFixed(2),
        label: 'PYE Credits',
      },
    };
  }, [selectedPackage]);

  useEffect(() => {
    let mounted = true;
    let card = null;

    const initSquare = async () => {
      try {
        const payments = await createSquarePayments(SQUARE_APPLICATION_ID);
        if (!mounted || !payments) return;

        card = await payments.card();
        await card.attach(cardContainerRef.current);
        cardRef.current = card;

        if (typeof payments.canUseApplePay === 'function') {
          const ok = await payments.canUseApplePay();
          setCanUseApplePay(Boolean(ok));
        }

        if (typeof payments.canUseGooglePay === 'function') {
          const ok = await payments.canUseGooglePay();
          setCanUseGooglePay(Boolean(ok));
        }
      } catch (err) {
        console.warn('Square payments initialization failed', err);
      }
    };

    initSquare();

    return () => {
      mounted = false;
      card?.destroy?.();
    };
  }, []);

  const tokenizeCard = async () => {
    setStatus('submitting');
    setMessage('');

    try {
      const card = cardRef.current;
      if (!card) {
        throw new Error('Card is not initialized yet. Please wait a moment and try again.');
      }

      const result = await card.tokenize();
      if (result.status !== 'OK') {
        throw new Error(result.errors?.[0]?.message || 'Card tokenization failed');
      }
      await submitPayment(result.token);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Card payment failed.');
    }
  };

  const tokenizeWallet = async (method) => {
    setStatus('submitting');
    setMessage('');

    try {
      const payments = await createSquarePayments(SQUARE_APPLICATION_ID);
      const wallet =
        method === 'apple'
          ? await payments.applePay(paymentRequest)
          : await payments.googlePay(paymentRequest);

      const result = await wallet.tokenize();
      if (result.status !== 'OK') {
        throw new Error(result.errors?.[0]?.message || 'Wallet tokenization failed');
      }
      await submitPayment(result.token);
    } catch (err) {
      console.error('Wallet tokenization error:', err);
      setStatus('error');
      setMessage(err.message || 'Wallet payment failed.');
    }
  };

  const submitPayment = async (token) => {
    try {
      const resp = await fetch('api/process_payment.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_id: token,
          amount: Math.round(selectedPackage.price * 100),
          credits: selectedPackage.credits,
        }),
      });

      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Server returned invalid JSON (status ${resp.status}): ${text.substring(0, 200)}`);
      }

      if (!resp.ok || !data.success) {
        throw new Error(data.message || `Payment failed (status ${resp.status})`);
      }

      setStatus('success');
      setMessage(`Success! Added ${selectedPackage.credits} credits.`);
      onSuccess?.({
        creditsAdded: selectedPackage.credits,
        amount: selectedPackage.price,
        newBalance: data.credits,
      });
    } catch (err) {
      console.error('Payment error', err);
      setStatus('error');
      setMessage(err.message || 'Unexpected error during payment.');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-900 text-white overflow-hidden font-sans">
      <header className="relative flex justify-center items-center px-6 py-6 shrink-0 border-b border-gray-700/50">
        <button
          onClick={onBack}
          className="absolute left-6 p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>
        <div className="flex items-center gap-4">
          <div className="bg-gray-800 p-3 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.3)]">
            <CreditCardIcon className="text-cyan-400" size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Buy Credits</h1>
            <p className="text-gray-400 text-xs tracking-widest uppercase">Secure Checkout</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto space-y-6">
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-300 mb-4">Select a credit pack and complete checkout using Apple Pay, Google Pay, or a card.</p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {CREDIT_PACKAGES.map((pkg) => (
                <button
                  key={pkg.credits}
                  type="button"
                  onClick={() => setSelectedPackage(pkg)}
                  className={`rounded-lg border p-4 text-left transition-all ${
                    selectedPackage.credits === pkg.credits
                      ? 'border-cyan-400 bg-gray-700/60'
                      : 'border-gray-700 hover:border-cyan-500'
                  }`}
                >
                  <div className="text-sm text-gray-400">{pkg.credits} credits</div>
                  <div className="text-xl font-bold">{formatMoney(pkg.price)}</div>
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div ref={cardContainerRef} className="rounded-lg border border-gray-700 bg-gray-900 p-4" />

              <button
                type="button"
                onClick={async () => {
                  setStatus('submitting');
                  setMessage('');

                  // Prefer a wallet flow if available.
                  if (canUseApplePay) {
                    await tokenizeWallet('apple');
                    return;
                  }

                  if (canUseGooglePay) {
                    await tokenizeWallet('google');
                    return;
                  }

                  await tokenizeCard();
                }}
                disabled={status === 'submitting'}
                className={`w-full rounded-lg py-3 font-bold text-black transition-colors ${
                  status === 'submitting'
                    ? 'bg-gray-600 cursor-wait'
                    : 'bg-cyan-500 hover:bg-cyan-400'
                }`}
              >
                {status === 'submitting' ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Processing...
                  </span>
                ) : (
                  `Pay ${formatMoney(selectedPackage.price)}`
                )}
              </button>

              <div className="flex flex-col gap-1 text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <Apple className={`h-4 w-4 ${canUseApplePay ? 'text-emerald-400' : 'text-gray-500'}`} />
                  <span>
                    {canUseApplePay ? 'Apple Pay available' : 'Apple Pay available in Safari on Apple devices'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className={`h-4 w-4 ${canUseGooglePay ? 'text-emerald-400' : 'text-gray-500'}`} />
                  <span>
                    {canUseGooglePay ? 'Google Pay available' : 'Google Pay available in Chrome on Android'}
                  </span>
                </div>
              </div>
            </div>

            {status === 'error' && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
                {message}
              </div>
            )}

            {status === 'success' && (
              <div className="mt-4 p-3 bg-green-900/30 border border-green-500/50 rounded-lg text-green-200 text-sm">
                {message}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="shrink-0 text-center py-4 bg-gray-900/95 backdrop-blur-sm border-t border-white/5 z-20">
        <div className="inline-block bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold px-4 py-2 rounded-full tracking-wider uppercase">
          Help kids code!
        </div>
      </footer>
    </div>
  );
}
