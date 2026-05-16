import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import MarketPlace from './MarketPlace';

function App() {
  return (
    <Router>
      <Routes>
        {/* Ito yung landing page / shop */}
        <Route path="/" element={<AdminDashboard />} />

        {/* Ito yung dashboard (e.g., localhost:5173/admin) */}
        <Route path="/shop" element={<MarketPlace />} />
      </Routes>
    </Router>
  );
}

export default App;