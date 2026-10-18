import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { makeQueryFunction } from '../providers/query.js';
import { calculateModelUsageCost } from '../billing.js';

const router = Router();
const MODEL_SET = [
  { id: 'grok-4.7', name: 'Grok 4.7', family: 'Grok' },
  { id: 'grok-4.6', name: 'Grok 4.6', family: 'Grok' },
  { id: 'gpt-5', name: 'GPT-5', family: 'OpenAI' },
  { id: 'gpt-4.1', name: 'GPT-4.1', family: 'OpenAI' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', family: 'Claude' },
  { id: 'claude-opus-5', name: 'Claude Opus 5', family: 'Claude' }
];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabaseAdmin = SUPABASE_URL && SUPABASE_SECRET_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

function cleanMessages(value) {
  if (!Array.isArray(value)) throw new Error('Please send a chat message.');
  const messages = value.slice(-12).map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string') {
      throw new Error('The chat history is invalid.');
    }
    const content = message.content.trim();
    if (!content || content.length > 8000) {
      throw new Error('Each chat message must be between 1 and 8,000 characters.');
    }
    return { role: message.role, content };
  });
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new Error('The latest chat message must be from you.');
  }
  return messages;
}

function transcript(messages) {
  return messages.map((m) => `${m.role === 'user' ? 'User' : 'Trusty'}: ${m.content}`).join('\n\n');
}

function parseVote(response, voterId) {
  const candidateIds = MODEL_SET.map((m) => m.id).filter((id) => id !== voterId);
  let parsed = null;
  const raw = String(response || '').trim();
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim());
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch {}
    }
  }
  if (typeof parsed?.vote === 'string' && candidateIds.includes(parsed.vote)) return parsed.vote;
  // Recover only an explicitly declared vote if a provider adds prose around it.
  const explicit =
    raw.match(/(?:i\s+)?vote\s+for\s+[`"' ]?([a-z0-9.-]+)/i) ||
    raw.match(/["']vote["']\s*:\s*["']([^"']+)["']/i) ||
    raw.match(/(?:selected|choice)(?:\s+model)?\s*[:=]\s*[`"' ]?([a-z0-9.-]+)/i);
  return explicit && candidateIds.includes(explicit[1]) ? explicit[1] : null;
}

function getTieWinners(votes) {
  const counts = Object.fromEntries(MODEL_SET.map((model) => [model.id, 0]));
  for (const vote of Object.values(votes)) counts[vote] += 1;
  const high = Math.max(...Object.values(counts));
  return { counts, tied: Object.keys(counts).filter((id) => counts[id] === high) };
}

async function getWallet(userId) {
  if (!supabaseAdmin) throw new Error('Billing is not configured on the server.');
  const { data, error } = await supabaseAdmin
    .from('wallets').select('balance_usd').eq('user_id', userId).maybeSingle();
  if (error || !data) throw new Error('Could not load your wallet balance.');
  return Number(data.balance_usd) || 0;
}

function estimateTrustyReservation(transcriptText, latestQuestion) {
  // Conservative preflight bound so a low wallet balance is rejected before API usage.
  const tokens = (chars) => Math.ceil(Math.max(0, chars) / 2) + 512;
  const draftChars = ('Conversation: ' + transcriptText + ' Latest question: ' + latestQuestion).length;
  const allDraftsChars = MODEL_SET.length * 1200 * 8 + 1000;
  const voteChars = 1800 + latestQuestion.length + allDraftsChars;
  const synthesisChars = 1800 + transcriptText.length + latestQuestion.length + allDraftsChars;
  let total = 0;
  let synthesisMax = 0;
  for (const model of MODEL_SET) {
    total += calculateModelUsageCost(model.id, { input_tokens: tokens(draftChars), output_tokens: 1200 });
    total += calculateModelUsageCost(model.id, { input_tokens: tokens(voteChars), output_tokens: 1600 });
    synthesisMax = Math.max(synthesisMax, calculateModelUsageCost(model.id, { input_tokens: tokens(synthesisChars), output_tokens: 2000 }));
  }
  return Math.round((Math.max(0.01, (total + synthesisMax) * 1.25) + Number.EPSILON) * 1e8) / 1e8;
}

async function chargeExactApiCost(userId, cost) {
  const roundedCost = Math.round((cost + Number.EPSILON) * 1e8) / 1e8;
  const { data: wallet, error: readError } = await supabaseAdmin
    .from('wallets').select('balance_usd').eq('user_id', userId).maybeSingle();
  if (readError || !wallet) throw new Error('Could not load your wallet balance.');
  const balance = Number(wallet.balance_usd) || 0;
  if (balance + 1e-10 < roundedCost) {
    const error = new Error('Your wallet balance is too low to cover this message. Add funds and try again.');
    error.statusCode = 402;
    throw error;
  }
  const next = Math.round((balance - roundedCost + Number.EPSILON) * 1e8) / 1e8;
  // Match the old balance in the update to avoid double-spending during concurrent requests.
  const { data, error } = await supabaseAdmin
    .from('wallets')
    .update({ balance_usd: next })
    .eq('user_id', userId)
    .eq('balance_usd', wallet.balance_usd)
    .select('balance_usd')
    .maybeSingle();
  if (error || !data) {
    const conflict = new Error('Your wallet changed during this message. Please retry.');
    conflict.statusCode = 409;
    throw conflict;
  }
  return { cost_usd: roundedCost, balance_usd: Number(data.balance_usd) || 0 };
}

router.post('/chat', async (req, res) => {
  const userId = req.authUser?.id;
  if (!userId) return res.status(401).json({ error: 'Please sign in to use Trusty.' });

  let messages;
  try {
    messages = cleanMessages(req.body?.messages);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const startingBalance = await getWallet(userId);
    if (startingBalance <= 0) {
      return res.status(402).json({ error: 'Your wallet is empty. Add funds before chatting with Trusty.' });
    }

    const queries = Object.fromEntries(MODEL_SET.map((model) => [model.id, makeQueryFunction(model.id)]));
    const chatTranscript = transcript(messages);
    const latestQuestion = messages[messages.length - 1].content;

    // Stage 1: all six models independently draft an answer.
    const drafts = await Promise.all(MODEL_SET.map(async (model) => {
      const result = await queries[model.id](
        'You are one of six models powering Trusty, a multi-model assistant. Answer the user helpfully, accurately, and clearly. Use the previous conversation for context. Do not mention internal voting or other models. If uncertain, say so.\n\nConversation:\n' +
        chatTranscript + '\n\nWrite your best answer to the latest user message: ' + latestQuestion,
        {
          systemPrompt: 'You are a helpful, accurate, general-purpose AI assistant. Answer directly and naturally. If uncertain, be transparent.',
          maxOutputTokens: 1200
        }
      );
      return { ...model, response: result };
    }));

    // Stage 2: only after all six drafts finish, expose the complete set to every voter.
    // Every voter receives every model's ID, name, and full response so the vote is based
    // on the actual answer quality rather than a guess or model reputation.
    const draftBlock = drafts.map((d) =>
      `MODEL ID: ${d.id}\nMODEL NAME: ${d.name}\nFULL DRAFT RESPONSE:\n${d.response}`
    ).join('\n\n================ MODEL RESPONSE ================\n\n');
    const votes = {};
    await Promise.all(MODEL_SET.map(async (voter) => {
      const eligibleModels = MODEL_SET.filter((m) => m.id !== voter.id);
      const voteText = await queries[voter.id](
        'VOTE AFTER READING THE RESPONSES BELOW. You can see all six full drafts, including the draft written by your own model. Read and compare the actual content of every draft before voting. Evaluate correctness, relevance to the user question, completeness, clear reasoning, appropriate uncertainty, and whether the answer handles disagreements responsibly. Do not choose based on brand reputation or model name alone.\n\n' +
        'Your voter model ID is: ' + voter.id + '. You are forbidden from voting for your own model. You must select exactly one DIFFERENT model from this eligible list: ' +
        eligibleModels.map((m) => m.id + ' (' + m.name + ')').join(', ') +
        '.\n\nReturn ONLY valid JSON with the exact schema {"vote":"eligible-model-id"}. The vote must exactly match one ID in the eligible list.\n\nUSER QUESTION:\n' +
        latestQuestion + '\n\nALL SIX FULL MODEL RESPONSES (read each before choosing):\n\n' + draftBlock,
        {
          systemPrompt: 'You are an impartial evaluator selecting the best answer synthesizer. Read the complete candidate responses provided by the user message. Compare their substance, then cast one valid vote for a model other than yourself. Return only the requested JSON.',
          maxOutputTokens: 120
        }
      );
      const vote = parseVote(voteText, voter.id);
      if (!vote) throw new Error(`The vote from ${voter.name} was invalid or attempted a forbidden self-vote.`);
      votes[voter.id] = vote;
    }));

    const { counts, tied } = getTieWinners(votes);
    const tieBreakUsed = tied.length > 1;
    const winnerId = tied.length === 1 ? tied[0] : tied[randomInt(tied.length)];
    const winner = MODEL_SET.find((model) => model.id === winnerId);

    // Stage 3: the winning model combines the useful parts of all six drafts.
    const finalAnswer = await queries[winnerId](
      'You are Trusty, the final synthesizer selected by a vote among six AI models. Produce one polished, direct answer to the user. Combine the strongest useful information from all six drafts, reconcile contradictions, remove repetition, and do not claim consensus when drafts disagree. Do not mention this internal process unless the user asks. Preserve useful caveats.\n\nConversation context:\n' +
      chatTranscript + '\n\nLatest user question:\n' + latestQuestion + '\n\nSix drafts to synthesize:\n' + draftBlock,
      {
        systemPrompt: 'You are Trusty, a helpful general-purpose AI assistant. Synthesize the best parts of all supplied drafts into one polished answer.',
        maxOutputTokens: 2000
      }
    );

    // Bill only provider-reported token usage, at configured API rates, with no markup.
    const usageByModel = {};
    let apiCost = 0;
    for (const model of MODEL_SET) {
      const usage = queries[model.id].getUsage();
      if (!usage.complete || usage.requests < 2 || !Number.isFinite(usage.input_tokens) ||
          !Number.isFinite(usage.output_tokens)) {
        throw new Error(`Token usage was incomplete for ${model.name}; exact billing could not be calculated safely.`);
      }
      usageByModel[model.id] = usage;
      apiCost += calculateModelUsageCost(model.id, usage);
    }
    if (!queries[winnerId].getUsage().requests || !queries[winnerId].getUsage().complete) {
      throw new Error('Final synthesis usage was not reported by the provider.');
    }
    apiCost = Math.round((apiCost + Number.EPSILON) * 1e8) / 1e8;

    const charge = await chargeExactApiCost(userId, apiCost);
    return res.json({
      answer: finalAnswer,
      synthesizer: { id: winner.id, name: winner.name },
      votes: MODEL_SET.map((model) => ({
        voter: model.name,
        votedFor: MODEL_SET.find((candidate) => candidate.id === votes[model.id])?.name || votes[model.id]
      })),
      voteCounts: Object.fromEntries(MODEL_SET.map((model) => [model.name, counts[model.id]])),
      tieBreakUsed,
      cost_usd: charge.cost_usd,
      balance_usd: charge.balance_usd,
      billing: 'Reported API token usage at configured provider rates; no markup.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Trusty error';
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 502;
    console.error('Trusty chat failed:', message);
    return res.status(status).json({
      error: status === 402 ? message :
        status === 409 ? message :
        'Trusty could not complete this message. No wallet charge was made by this request; please try again.'
    });
  }
});

export default router;
