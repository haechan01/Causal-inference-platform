// src/components/UploadPage.tsx
import React, { useState } from 'react';
import axios from 'axios';

interface Result {
  estimate: number;
  conf_int: [number, number];
  summary: string;
}

const UploadPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [treatment, setTreatment] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [outcome, setOutcome] = useState<string>('');
  const [treatmentTime, setTreatmentTime] = useState<string>('');
  const [result, setResult] = useState<Result | null>(null);

  const handleSubmit = async () => {
    if (!file) return alert('Upload a CSV file first.');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('treatment', treatment);
    formData.append('time', time);
    formData.append('outcome', outcome);
    formData.append('treatment_time', treatmentTime);

    try {
      const res = await axios.post<Result>('http://localhost:5000/analyze/did', formData);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      alert('Error running analysis.');
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Upload Data for DiD Analysis</h2>
      <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <input placeholder="Treatment column" value={treatment} onChange={(e) => setTreatment(e.target.value)} />
      <input placeholder="Time column" value={time} onChange={(e) => setTime(e.target.value)} />
      <input placeholder="Outcome column" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
      <input placeholder="Treatment year" value={treatmentTime} onChange={(e) => setTreatmentTime(e.target.value)} />
      <button onClick={handleSubmit}>Run DiD</button>

      {result && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Estimated Effect: {result.estimate}</h3>
          <p>95% CI: [{result.conf_int[0]}, {result.conf_int[1]}]</p>
          <pre style={{ background: '#eee', padding: '1rem', overflowX: 'auto' }}>
            {result.summary}
          </pre>
        </div>
      )}
    </div>
  );
};

export default UploadPage;
