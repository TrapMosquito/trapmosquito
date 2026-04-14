// FILE: /api/create-checkout.js
// Vercel Serverless Function — creates a Stripe Checkout session
//
// SETUP:
//   1. npm install stripe  (run in your project root)
//   2. Add STRIPE_SECRET_KEY to Vercel environment variables
//   3. Add SITE_URL to Vercel environment variables

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { priceId, userId, userEmail, planName } = req.body;
  if (!priceId || !userId || !userEmail) return res.status(400).json({ error: 'Missing fields' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: userEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, planName: planName || 'essential' },
      subscription_data: { metadata: { userId } },
      allow_promotion_codes: true,
      success_url: `${process.env.SITE_URL}/portal.html?success=true`,
      cancel_url: `${process.env.SITE_URL}/portal.html`,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
