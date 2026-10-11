
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import evaluateRouter from './routes/evaluate.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20kb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Trust AI Backend'
  });
});

app.use('/api/evaluate', evaluateRouter);

app.listen(PORT, () => {
  console.log(`Trust AI backend running on port ${PORT}`);
});
