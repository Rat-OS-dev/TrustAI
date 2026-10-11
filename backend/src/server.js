
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

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

app.listen(PORT, () => {
  console.log(`Trust AI backend running on port ${PORT}`);
});
