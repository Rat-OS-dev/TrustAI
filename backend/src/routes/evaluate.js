
import { Router } from 'express';

const router = Router();

router.post('/', (req, res) => {
  const { answer, weights } = req.body ?? {};

  if (typeof answer !== 'string' || !answer.trim()) {
    return res.status(400).json({
      error: 'Please provide an answer to evaluate.'
    });
  }

  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    return res.status(400).json({
      error: 'Please provide model weights.'
    });
  }

  const providers = ['grok', 'openai', 'gemini'];
  const validWeights = providers.every(
    (provider) =>
      typeof weights[provider] === 'number' &&
      weights[provider] >= 5 &&
      weights[provider] <= 100
  );

  const total = providers.reduce(
    (sum, provider) => sum + (weights[provider] ?? 0),
    0
  );

  if (!validWeights || total !== 100) {
    return res.status(400).json({
      error: 'Each model weight must be 5–100%, and the total must equal 100%.'
    });
  }

  return res.status(501).json({
    message: 'Validation passed. Evaluation is not implemented yet.'
  });
});

export default router;
