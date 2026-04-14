// FILE: /api/webhook.js
// Listens for Stripe payment events and updates Supabase automatically.
//
// SETUP:
//   1. Stripe Dashboard → Developers → Webhooks → Add Endpoint
//      URL: https://trapmosquito.com/api/webhook
//      Events: checkout.session.completed, customer.subscription.deleted, customer.subscription.updated
//   2. Copy Webhook Signing Secret → add as STRIPE_WEBHOOK_SECRET in Vercel
//   3. Add SUPABASE_SERVICE_ROLE_KEY to Vercel (NOT the anon key — get it from Supabase → Settings → API)

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(Buffer.from(data)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const rawBody = await getRawBody(req);
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const planName = session.metadata?.planName || 'essential';
    if (!userId) return res.status(400).send('No userId');
    const nextService = new Date();
    nextService.setDate(nextService.getDate() + 30);
    await supabase.from('customers').update({
      plan: planName,
      subscription_status: 'active',
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription,
      next_service_date: nextService.toISOString().split('T')[0]
    }).eq('user_id', userId);
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    if (sub.metadata?.userId) await supabase.from('customers').update({ subscription_status: 'cancelled' }).eq('user_id', sub.metadata.userId);
  }

  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    if (sub.metadata?.userId) await supabase.from('customers').update({ subscription_status: sub.status }).eq('user_id', sub.metadata.userId);
  }

  return res.status(200).json({ received: true });
}
