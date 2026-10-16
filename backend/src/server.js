import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import evaluateRouter from './routes/evaluate.js';

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

// Keep the Supabase secret exclusively on the backend.
// If it is missing, the existing fact-checker can still start.
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SECRET_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      })
    : null;

app.use(cors());
app.use(express.json({ limit: '20kb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Trust AI Backend',
    accountDatabaseConfigured: Boolean(supabaseAdmin)
  });
});

// Verify a real Supabase access token for account endpoints.
async function requireAuthenticatedUser(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(503).json({
      error: 'The account database is not configured on the server.'
    });
  }

  const authorization = req.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      error: 'Please sign in to your Trust AI account.'
    });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(match[1]);

    if (error || !data?.user) {
      return res.status(401).json({
        error: 'Your session is invalid or expired. Please sign in again.'
      });
    }

    req.authUser = data.user;
    return next();
  } catch (error) {
    console.error(
      'Account authentication failed:',
      error instanceof Error ? error.message : error
    );

    return res.status(503).json({
      error: 'Could not verify your account right now.'
    });
  }
}

// Get the signed-in user's profile and wallet balance.
// The user ID always comes from the verified access token.
app.get('/api/account', requireAuthenticatedUser, async (req, res) => {
  try {
    const userId = req.authUser.id;

    const [profileResult, walletResult] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('full_name, date_of_birth')
        .eq('id', userId)
        .maybeSingle(),

      supabaseAdmin
        .from('wallets')
        .select('balance_usd')
        .eq('user_id', userId)
        .maybeSingle()
    ]);

    if (profileResult.error || walletResult.error) {
      console.error(
        'Account lookup failed:',
        profileResult.error?.message || walletResult.error?.message
      );

      return res.status(500).json({
        error: 'Could not load your account details.'
      });
    }

    if (!profileResult.data || !walletResult.data) {
      return res.status(404).json({
        error:
          'Your account records are missing. Please contact support.'
      });
    }

    return res.json({
      email: req.authUser.email || '',
      full_name: profileResult.data.full_name || '',
      date_of_birth: profileResult.data.date_of_birth,
      balance_usd: walletResult.data.balance_usd
    });
  } catch (error) {
    console.error(
      'Account lookup failed:',
      error instanceof Error ? error.message : error
    );

    return res.status(500).json({
      error: 'Could not load your account details.'
    });
  }
});

// Update profile details for the signed-in user only.
// This endpoint cannot change wallet balances.
app.patch(
  '/api/account/profile',
  requireAuthenticatedUser,
  async (req, res) => {
    const body = req.body ?? {};
    const updates = {};

    if (Object.hasOwn(body, 'full_name')) {
      if (
        typeof body.full_name !== 'string' ||
        body.full_name.trim().length < 1 ||
        body.full_name.trim().length > 120
      ) {
        return res.status(400).json({
          error: 'Name must be between 1 and 120 characters.'
        });
      }

      updates.full_name = body.full_name.trim();
    }

    if (Object.hasOwn(body, 'date_of_birth')) {
      const value = body.date_of_birth;

      if (value === null || value === '') {
        updates.date_of_birth = null;
      } else {
        if (
          typeof value !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value)
        ) {
          return res.status(400).json({
            error: 'Date of birth must use YYYY-MM-DD format.'
          });
        }

        const date = new Date(`${value}T00:00:00.000Z`);

        if (
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value ||
          date > new Date()
        ) {
          return res.status(400).json({
            error: 'Please provide a valid date of birth.'
          });
        }

        updates.date_of_birth = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Provide a name or date of birth to update.'
      });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(updates)
        .eq('id', req.authUser.id)
        .select('full_name, date_of_birth')
        .maybeSingle();

      if (error) {
        console.error('Profile update failed:', error.message);

        return res.status(500).json({
          error: 'Could not update your profile.'
        });
      }

      if (!data) {
        return res.status(404).json({
          error: 'Your profile was not found.'
        });
      }

      return res.json({
        full_name: data.full_name,
        date_of_birth: data.date_of_birth
      });
    } catch (error) {
      console.error(
        'Profile update failed:',
        error instanceof Error ? error.message : error
      );

      return res.status(500).json({
        error: 'Could not update your profile.'
      });
    }
  }
);

// Existing fact-checking endpoint remains connected.
app.use('/api/evaluate', evaluateRouter);

app.listen(PORT, () => {
  console.log(`Trust AI backend running on port ${PORT}`);

  if (!supabaseAdmin) {
    console.warn(
      'Supabase account features are disabled: ' +
      'check SUPABASE_URL and SUPABASE_SECRET_KEY in Render.'
    );
  }
});
